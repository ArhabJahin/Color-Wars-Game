const crypto = require("node:crypto");
const {
  PLAYER_POOL,
  sanitizeAction,
  sanitizeClientId,
  sanitizeMatchmakingSettings,
  sanitizeUsername,
  createGameState,
  cloneGameState,
  getCurrentPlayerId,
  simulateAction,
} = require("./validation");
const { chooseBotAction } = require("./bot");

const RECONNECT_GRACE_MS = 30_000;
const ENDED_MATCH_CLEANUP_MS = 120_000;
const BOT_MOVE_DELAY_MS = 900;

function makeShortCode(seed) {
  const hash = crypto.createHash("sha1").update(String(seed || crypto.randomUUID())).digest("hex");
  return hash.slice(0, 4).toUpperCase();
}

function makeMatchId() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

function sanitizeServerMatchId(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "")
    .slice(0, 16);
}

function getQueueKey(settings) {
  return `${settings.preset}:${settings.playerCount}`;
}

function clonePublicPlayer(player) {
  return {
    clientId: player.clientId,
    colorId: player.colorId,
    colorName: player.colorName,
    accent: player.accent,
    username: player.username,
    displayName: player.displayName,
    connected: player.connected,
    disconnectedAt: player.disconnectedAt,
    graceExpiresAt: player.graceExpiresAt,
    forfeited: player.forfeited,
    replacedByBot: player.replacedByBot,
    isBot: player.isBot,
    leaveReason: player.leaveReason,
  };
}

function buildQueueMessage(joinedCount, playerCount) {
  if (joinedCount >= playerCount) {
    return "Match found";
  }
  if (joinedCount <= 1) {
    return `Waiting for players... ${joinedCount}/${playerCount} joined.`;
  }
  const remaining = playerCount - joinedCount;
  return `${joinedCount}/${playerCount} joined - waiting for ${remaining} more ${remaining === 1 ? "player" : "players"}.`;
}

class MatchmakingStore {
  constructor() {
    this.queues = new Map();
    this.matches = new Map();
    this.socketLocations = new Map();
    this.reconnectTimers = new Map();
    this.botTimers = new Map();
    this.cleanupTimers = new Map();
    this.handlers = {
      onMatchUpdate: null,
      onBotMove: null,
    };
  }

  setEventHandlers(handlers = {}) {
    this.handlers = {
      ...this.handlers,
      ...handlers,
    };
  }

  getOrCreateQueue(settings) {
    const key = getQueueKey(settings);
    if (!this.queues.has(key)) {
      this.queues.set(key, {
        key,
        settings,
        players: [],
      });
    }
    return this.queues.get(key);
  }

  createPlayer({ socketId, clientId, username }) {
    return {
      socketId,
      clientId,
      username,
      shortCode: makeShortCode(clientId),
      colorId: "",
      colorName: "",
      accent: "",
      displayName: "",
      connected: true,
      disconnectedAt: null,
      graceExpiresAt: null,
      forfeited: false,
      replacedByBot: false,
      isBot: false,
      leaveReason: "",
    };
  }

  assignColors(players) {
    for (const [index, player] of players.entries()) {
      const color = PLAYER_POOL[index];
      player.colorId = color.id;
      player.colorName = color.name;
      player.accent = color.accent;
    }
  }

  refreshDisplayNames(players) {
    const seen = new Map();
    for (const player of players) {
      const baseName = player.isBot
        ? (player.displayName || `Bot ${player.colorName}`)
        : (player.username || `${player.colorName} #${player.shortCode}`);
      const key = baseName.toLowerCase();
      const count = seen.get(key) || 0;
      player.displayName = count === 0 ? baseName : `${baseName} ${player.shortCode.slice(0, 2)}`;
      seen.set(key, count + 1);
    }
  }

  refreshQueue(queue) {
    this.assignColors(queue.players);
    this.refreshDisplayNames(queue.players);
  }

  queueSocketIds(queue) {
    return queue.players.map((player) => player.socketId).filter(Boolean);
  }

  matchSocketIds(match) {
    return match.players
      .filter((player) => player.socketId && !player.isBot && player.connected)
      .map((player) => player.socketId);
  }

  snapshotQueue(queue) {
    this.refreshQueue(queue);
    return {
      key: queue.key,
      settings: { ...queue.settings },
      status: "waiting",
      playerCount: queue.settings.playerCount,
      joinedCount: queue.players.length,
      message: buildQueueMessage(queue.players.length, queue.settings.playerCount),
      players: queue.players.map(clonePublicPlayer),
    };
  }

  snapshotMatch(match) {
    return {
      id: match.id,
      settings: { ...match.settings },
      status: match.status,
      playerCount: match.settings.playerCount,
      players: match.players.map(clonePublicPlayer),
      state: match.state ? cloneGameState(match.state) : null,
      tossWinnerIndex: match.tossWinnerIndex,
      systemMessage: match.systemMessage || "",
      systemMessageId: match.systemMessageId || 0,
      serverTime: Date.now(),
    };
  }

  getReconnectTimerKey(matchId, clientId) {
    return `${matchId}:${clientId}`;
  }

  setSystemMessage(match, message) {
    match.systemMessage = message;
    match.systemMessageId = (match.systemMessageId || 0) + 1;
    match.updatedAt = Date.now();
  }

  emitMatchUpdate(match) {
    if (typeof this.handlers.onMatchUpdate === "function") {
      this.handlers.onMatchUpdate(this.snapshotMatch(match), this.matchSocketIds(match));
    }
  }

  clearReconnectTimer(matchId, clientId) {
    const key = this.getReconnectTimerKey(matchId, clientId);
    const timer = this.reconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(key);
    }
  }

  scheduleReconnectTimeout(match, player) {
    this.clearReconnectTimer(match.id, player.clientId);
    const delay = Math.max(0, Number(player.graceExpiresAt || 0) - Date.now());
    const key = this.getReconnectTimerKey(match.id, player.clientId);
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(key);
      this.handleReconnectTimeout(match.id, player.clientId);
    }, delay);
    this.reconnectTimers.set(key, timer);
  }

  scheduleEndedMatchCleanup(match) {
    const existingTimer = this.cleanupTimers.get(match.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      this.matches.delete(match.id);
      this.cleanupTimers.delete(match.id);
      for (const [socketId, location] of this.socketLocations.entries()) {
        if (location.kind === "match" && location.matchId === match.id) {
          this.socketLocations.delete(socketId);
        }
      }
    }, ENDED_MATCH_CLEANUP_MS);
    this.cleanupTimers.set(match.id, timer);
  }

  findQueueByClientId(clientId) {
    for (const queue of this.queues.values()) {
      const player = queue.players.find((entry) => entry.clientId === clientId);
      if (player) {
        return { queue, player };
      }
    }
    return null;
  }

  findMatchByClientId(clientId) {
    for (const match of this.matches.values()) {
      const player = match.players.find((entry) => entry.clientId === clientId);
      if (player) {
        return { match, player };
      }
    }
    return null;
  }

  findActiveMatchForClient(clientId) {
    const safeClientId = sanitizeClientId(clientId);
    if (!safeClientId) {
      return null;
    }

    for (const match of this.matches.values()) {
      if (match.status !== "playing") {
        continue;
      }
      const player = match.players.find((entry) => entry.clientId === safeClientId);
      if (player && !player.forfeited && !player.replacedByBot && !player.isBot) {
        return { match, player };
      }
    }
    return null;
  }

  getActiveMatch({ socketId, clientId, matchId }) {
    const safeClientId = sanitizeClientId(clientId);
    const safeMatchId = sanitizeServerMatchId(matchId);
    if (!safeClientId) {
      return { ok: false, code: "MISSING_CLIENT", error: "Missing client id.", clearMatchId: true };
    }

    const entry = safeMatchId
      ? (() => {
          const match = this.matches.get(safeMatchId);
          const player = match?.players.find((item) => item.clientId === safeClientId);
          return match && player ? { match, player } : null;
        })()
      : this.findActiveMatchForClient(safeClientId);

    if (!entry) {
      return { ok: false, code: "MATCH_UNAVAILABLE", error: "Previous match unavailable.", clearMatchId: true };
    }

    const { match, player } = entry;
    if (player.replacedByBot) {
      return {
        ok: false,
        code: "SEAT_REPLACED",
        error: player.leaveReason === "forfeit"
          ? "You forfeited this match."
          : "You were replaced by a bot after timeout.",
        clearMatchId: true,
        match: this.snapshotMatch(match),
      };
    }
    if (player.forfeited || player.leaveReason === "timeout") {
      return {
        ok: false,
        code: player.leaveReason === "timeout" ? "MATCH_TIMEOUT_LOSS" : "MATCH_FORFEITED",
        error: player.leaveReason === "timeout" ? "You lost by timeout." : "Match forfeited.",
        clearMatchId: true,
        match: this.snapshotMatch(match),
      };
    }
    if (match.status !== "playing") {
      return {
        ok: false,
        code: "MATCH_ENDED",
        error: match.state?.winner === player.colorId ? "Your match ended." : "Previous match ended.",
        clearMatchId: true,
        match: this.snapshotMatch(match),
      };
    }

    if (socketId && player.connected) {
      if (player.socketId && player.socketId !== socketId) {
        this.socketLocations.delete(player.socketId);
      }
      player.socketId = socketId;
      this.socketLocations.set(socketId, { kind: "match", matchId: match.id });
    }

    return {
      ok: true,
      canRejoin: true,
      matchId: match.id,
      graceExpiresAt: player.graceExpiresAt || null,
      match: this.snapshotMatch(match),
      matchSocketIds: this.matchSocketIds(match),
    };
  }

  removeSocketFromQueue(socketId) {
    const location = this.socketLocations.get(socketId);
    if (!location || location.kind !== "queue") {
      return null;
    }

    this.socketLocations.delete(socketId);
    const queue = this.queues.get(location.key);
    if (!queue) {
      return null;
    }

    const before = queue.players.length;
    queue.players = queue.players.filter((player) => player.socketId !== socketId);
    if (queue.players.length === before) {
      return null;
    }

    this.refreshQueue(queue);
    return {
      queue: this.snapshotQueue(queue),
      recipients: this.queueSocketIds(queue),
    };
  }

  removeClientFromQueues(clientId) {
    const affected = [];
    for (const queue of this.queues.values()) {
      const before = queue.players.length;
      queue.players = queue.players.filter((player) => player.clientId !== clientId);
      if (queue.players.length !== before) {
        for (const [socketId, location] of this.socketLocations.entries()) {
          if (location.kind === "queue" && location.key === queue.key) {
            const stillInQueue = queue.players.some((player) => player.socketId === socketId);
            if (!stillInQueue) {
              this.socketLocations.delete(socketId);
            }
          }
        }
        this.refreshQueue(queue);
        affected.push({
          queue: this.snapshotQueue(queue),
          recipients: this.queueSocketIds(queue),
        });
      }
    }
    return affected;
  }

  startMatchFromQueue(queue) {
    const matchedPlayers = queue.players.splice(0, queue.settings.playerCount);
    this.assignColors(matchedPlayers);
    this.refreshDisplayNames(matchedPlayers);

    const players = PLAYER_POOL.slice(0, queue.settings.playerCount);
    const state = createGameState({
      rows: queue.settings.rows,
      cols: queue.settings.cols,
      players,
    });
    const tossWinnerIndex = Math.floor(Math.random() * queue.settings.playerCount);
    state.currentPlayerIndex = tossWinnerIndex;

    const match = {
      id: makeMatchId(),
      settings: { ...queue.settings },
      status: "playing",
      players: matchedPlayers,
      state,
      tossWinnerIndex,
      systemMessage: "Match found. Starting match...",
      systemMessageId: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.matches.set(match.id, match);
    for (const player of matchedPlayers) {
      this.socketLocations.set(player.socketId, { kind: "match", matchId: match.id });
    }

    this.refreshQueue(queue);
    return {
      match: this.snapshotMatch(match),
      matchSocketIds: this.matchSocketIds(match),
      queue: this.snapshotQueue(queue),
      queueSocketIds: this.queueSocketIds(queue),
    };
  }

  joinQueue({ socketId, clientId, username, settings }) {
    const safeClientId = sanitizeClientId(clientId);
    if (!safeClientId) {
      return { ok: false, error: "Missing client id." };
    }
    const safeUsername = sanitizeUsername(username);
    if (!safeUsername.ok) {
      return { ok: false, error: safeUsername.error };
    }

    const existingMatch = this.findActiveMatchForClient(safeClientId);
    if (existingMatch) {
      return {
        ok: false,
        code: "ACTIVE_MATCH_EXISTS",
        error: "You are already in a match.",
        canRejoin: true,
        matchId: existingMatch.match.id,
        graceExpiresAt: existingMatch.player.graceExpiresAt || null,
        match: this.snapshotMatch(existingMatch.match),
      };
    }

    const affectedQueues = this.removeClientFromQueues(safeClientId);
    const safeSettings = sanitizeMatchmakingSettings(settings);
    const queue = this.getOrCreateQueue(safeSettings);

    queue.players.push(this.createPlayer({
      socketId,
      clientId: safeClientId,
      username: safeUsername.username,
    }));
    this.socketLocations.set(socketId, { kind: "queue", key: queue.key });
    this.refreshQueue(queue);

    if (queue.players.length >= queue.settings.playerCount) {
      return {
        ok: true,
        affectedQueues,
        started: this.startMatchFromQueue(queue),
      };
    }

    return {
      ok: true,
      affectedQueues,
      queue: this.snapshotQueue(queue),
      recipients: this.queueSocketIds(queue),
    };
  }

  cancelQueue({ socketId, clientId }) {
    const safeClientId = sanitizeClientId(clientId);
    const removedBySocket = this.removeSocketFromQueue(socketId);
    const affectedQueues = safeClientId ? this.removeClientFromQueues(safeClientId) : [];
    return {
      ok: true,
      cancelled: true,
      updates: [removedBySocket, ...affectedQueues].filter(Boolean),
    };
  }

  reconnectMatch({ socketId, clientId, matchId }) {
    const safeClientId = sanitizeClientId(clientId);
    const safeMatchId = sanitizeServerMatchId(matchId);
    const match = this.matches.get(safeMatchId);
    if (!safeClientId || !match) {
      return { ok: false, code: "MATCH_UNAVAILABLE", error: "Reconnect unavailable.", clearMatchId: true };
    }

    const player = match.players.find((entry) => entry.clientId === safeClientId);
    if (!player) {
      return { ok: false, code: "NOT_IN_MATCH", error: "You are not in this match.", clearMatchId: true };
    }
    if (player.replacedByBot) {
      return {
        ok: false,
        code: "SEAT_REPLACED",
        error: player.leaveReason === "forfeit"
          ? "You forfeited this match."
          : "You were replaced by a bot after timeout.",
        clearMatchId: true,
        match: this.snapshotMatch(match),
      };
    }
    if (player.forfeited || player.leaveReason === "timeout") {
      return {
        ok: false,
        code: player.leaveReason === "timeout" ? "MATCH_TIMEOUT_LOSS" : "MATCH_FORFEITED",
        error: player.leaveReason === "timeout" ? "You lost by timeout." : "Match forfeited.",
        clearMatchId: true,
        match: this.snapshotMatch(match),
      };
    }
    if (match.status !== "playing" || match.state?.winner) {
      return {
        ok: false,
        code: "MATCH_ENDED",
        error: "Previous match ended.",
        clearMatchId: true,
        match: this.snapshotMatch(match),
      };
    }
    if (player.graceExpiresAt && Date.now() > player.graceExpiresAt) {
      this.handleReconnectTimeout(match.id, player.clientId);
      return {
        ok: false,
        code: match.settings.playerCount === 2 ? "MATCH_TIMEOUT_LOSS" : "SEAT_REPLACED",
        error: match.settings.playerCount === 2 ? "You lost by timeout." : "You were replaced by a bot after timeout.",
        clearMatchId: true,
        match: this.snapshotMatch(match),
      };
    }

    this.clearReconnectTimer(match.id, player.clientId);
    if (player.socketId && player.socketId !== socketId) {
      this.socketLocations.delete(player.socketId);
    }
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    player.graceExpiresAt = null;
    player.leaveReason = "";
    match.updatedAt = Date.now();
    this.socketLocations.set(socketId, { kind: "match", matchId: match.id });
    this.refreshDisplayNames(match.players);
    this.setSystemMessage(match, `${player.displayName} rejoined the match.`);
    return {
      ok: true,
      match: this.snapshotMatch(match),
      matchSocketIds: this.matchSocketIds(match),
    };
  }

  updateProfile({ socketId, clientId, username }) {
    const safeClientId = sanitizeClientId(clientId);
    const safeUsername = sanitizeUsername(username);
    if (!safeClientId || !safeUsername.ok) {
      return { ok: false, error: safeUsername.error || "Missing client id." };
    }

    const queueEntry = this.findQueueByClientId(safeClientId);
    if (queueEntry) {
      queueEntry.player.username = safeUsername.username;
      this.refreshQueue(queueEntry.queue);
      return {
        ok: true,
        queue: this.snapshotQueue(queueEntry.queue),
        recipients: this.queueSocketIds(queueEntry.queue),
      };
    }

    const matchEntry = this.findMatchByClientId(safeClientId);
    if (matchEntry) {
      matchEntry.player.username = safeUsername.username;
      this.refreshDisplayNames(matchEntry.match.players);
      matchEntry.match.updatedAt = Date.now();
      return {
        ok: true,
        match: this.snapshotMatch(matchEntry.match),
        matchSocketIds: this.matchSocketIds(matchEntry.match),
      };
    }

    this.socketLocations.delete(socketId);
    return { ok: true };
  }

  applyMove({ matchId, clientId, action }) {
    const match = this.matches.get(String(matchId ?? "").trim().toUpperCase());
    if (!match) {
      return { ok: false, error: "Match unavailable." };
    }
    if (match.status !== "playing" || !match.state) {
      return { ok: false, error: "Match has ended." };
    }
    if (match.state.winner) {
      return { ok: false, error: "Match has ended." };
    }

    const player = match.players.find((entry) => entry.clientId === sanitizeClientId(clientId));
    if (!player) {
      return { ok: false, error: "You are not in this match." };
    }
    if (player.forfeited || player.replacedByBot || player.isBot) {
      return { ok: false, error: "This seat is no longer controlled by you." };
    }
    if (!player.connected) {
      return { ok: false, error: "Player is disconnected." };
    }

    const currentPlayerId = getCurrentPlayerId(match.state);
    if (player.colorId !== currentPlayerId) {
      return { ok: false, error: "Not your turn." };
    }

    const safeAction = sanitizeAction(action);
    if (!safeAction) {
      return { ok: false, error: "Invalid move." };
    }

    const simulation = simulateAction(match.state, safeAction, currentPlayerId);
    if (!simulation.frames.length) {
      return { ok: false, error: "Illegal move." };
    }

    match.state = simulation.state;
    match.status = match.state.winner ? "ended" : "playing";
    match.updatedAt = Date.now();
    if (match.status === "ended") {
      this.scheduleEndedMatchCleanup(match);
    } else {
      this.maybeScheduleBotTurn(match);
    }
    return {
      ok: true,
      match: this.snapshotMatch(match),
      matchSocketIds: this.matchSocketIds(match),
      action: safeAction,
      playerId: currentPlayerId,
      state: cloneGameState(match.state),
      frames: simulation.frames,
      winner: match.state.winner,
    };
  }

  finishMatchForLeavingPlayer(match, player, reason) {
    this.clearReconnectTimer(match.id, player.clientId);
    player.connected = false;
    player.disconnectedAt = player.disconnectedAt || Date.now();
    player.graceExpiresAt = null;
    player.forfeited = true;
    player.leaveReason = reason;

    const winner = match.players.find((entry) => entry.clientId !== player.clientId && !entry.forfeited);
    if (winner && match.state) {
      match.state.winner = winner.colorId;
    }
    match.status = "ended";
    this.setSystemMessage(match, `You win. ${player.displayName} left the match.`);
    this.scheduleEndedMatchCleanup(match);
    return this.snapshotMatch(match);
  }

  replacePlayerWithBot(match, player, reason) {
    const originalName = player.displayName || `${player.colorName} #${player.shortCode}`;
    this.clearReconnectTimer(match.id, player.clientId);
    player.originalDisplayName = player.originalDisplayName || originalName;
    player.connected = true;
    player.disconnectedAt = null;
    player.graceExpiresAt = null;
    player.replacedByBot = true;
    player.isBot = true;
    player.leaveReason = reason;
    player.forfeited = reason === "forfeit";
    player.socketId = "";
    player.username = "";
    player.displayName = `${originalName} Bot`;
    this.setSystemMessage(
      match,
      reason === "forfeit"
        ? `${originalName} left the match. ${originalName} has been replaced by a bot.`
        : `${originalName} did not return. Bot is now playing as ${player.colorName}.`,
    );
    this.maybeScheduleBotTurn(match);
    return this.snapshotMatch(match);
  }

  handleReconnectTimeout(matchId, clientId) {
    const safeMatchId = sanitizeServerMatchId(matchId);
    const safeClientId = sanitizeClientId(clientId);
    const match = this.matches.get(safeMatchId);
    if (!match || match.status !== "playing" || match.state?.winner) {
      return { ok: false, error: "Match unavailable." };
    }

    const player = match.players.find((entry) => entry.clientId === safeClientId);
    if (
      !player ||
      player.connected ||
      player.forfeited ||
      player.replacedByBot ||
      player.isBot
    ) {
      return { ok: true, skipped: true, match: match ? this.snapshotMatch(match) : null };
    }
    if (player.graceExpiresAt && Date.now() < player.graceExpiresAt) {
      this.scheduleReconnectTimeout(match, player);
      return { ok: true, skipped: true, match: this.snapshotMatch(match) };
    }

    const snapshot = match.settings.playerCount === 2
      ? this.finishMatchForLeavingPlayer(match, player, "timeout")
      : this.replacePlayerWithBot(match, player, "timeout");
    this.emitMatchUpdate(match);
    return {
      ok: true,
      match: snapshot,
      matchSocketIds: this.matchSocketIds(match),
    };
  }

  forfeitMatch({ socketId, clientId, matchId }) {
    const safeClientId = sanitizeClientId(clientId);
    const safeMatchId = sanitizeServerMatchId(matchId);
    const entry = safeMatchId
      ? (() => {
          const match = this.matches.get(safeMatchId);
          const player = match?.players.find((item) => item.clientId === safeClientId);
          return match && player ? { match, player } : null;
        })()
      : this.findActiveMatchForClient(safeClientId);

    if (!entry) {
      return { ok: false, code: "MATCH_UNAVAILABLE", error: "Match unavailable.", clearMatchId: true };
    }

    const { match, player } = entry;
    if (socketId) {
      this.socketLocations.delete(socketId);
    }
    if (player.socketId) {
      this.socketLocations.delete(player.socketId);
    }
    if (player.replacedByBot || player.forfeited || match.status !== "playing") {
      return {
        ok: true,
        clearMatchId: true,
        message: "Match no longer active.",
        match: this.snapshotMatch(match),
        matchSocketIds: this.matchSocketIds(match),
      };
    }

    const snapshot = match.settings.playerCount === 2
      ? this.finishMatchForLeavingPlayer(match, player, "forfeit")
      : this.replacePlayerWithBot(match, player, "forfeit");
    this.emitMatchUpdate(match);
    return {
      ok: true,
      clearMatchId: true,
      message: "Match forfeited.",
      match: snapshot,
      matchSocketIds: this.matchSocketIds(match),
    };
  }

  expireDisconnectedPlayers() {
    const updates = [];
    for (const match of this.matches.values()) {
      if (match.status !== "playing") {
        continue;
      }
      for (const player of match.players) {
        if (
          !player.connected &&
          player.graceExpiresAt &&
          Date.now() >= player.graceExpiresAt
        ) {
          const result = this.handleReconnectTimeout(match.id, player.clientId);
          if (result.ok && result.match) {
            updates.push(result);
          }
        }
      }
    }
    return updates;
  }

  maybeScheduleBotTurn(match) {
    if (!match || match.status !== "playing" || !match.state || match.state.winner) {
      return false;
    }
    const currentPlayerId = getCurrentPlayerId(match.state);
    const player = match.players.find((entry) => entry.colorId === currentPlayerId);
    if (!player?.isBot || !player.replacedByBot) {
      return false;
    }
    if (this.botTimers.has(match.id)) {
      return true;
    }

    const timer = setTimeout(() => {
      this.botTimers.delete(match.id);
      const result = this.applyBotMove(match.id);
      if (result.ok && typeof this.handlers.onBotMove === "function") {
        this.handlers.onBotMove(result);
      }
    }, BOT_MOVE_DELAY_MS);
    this.botTimers.set(match.id, timer);
    return true;
  }

  applyBotMove(matchId) {
    const match = this.matches.get(sanitizeServerMatchId(matchId));
    if (!match || match.status !== "playing" || !match.state || match.state.winner) {
      return { ok: false, error: "Match unavailable." };
    }

    const currentPlayerId = getCurrentPlayerId(match.state);
    const player = match.players.find((entry) => entry.colorId === currentPlayerId);
    if (!player?.isBot || !player.replacedByBot) {
      return { ok: false, error: "Current player is not a bot." };
    }

    const action = chooseBotAction(match.state, currentPlayerId);
    if (!action) {
      return { ok: false, error: "Bot has no legal move." };
    }

    const simulation = simulateAction(match.state, action, currentPlayerId);
    if (!simulation.frames.length) {
      return { ok: false, error: "Bot move rejected." };
    }

    match.state = simulation.state;
    match.status = match.state.winner ? "ended" : "playing";
    match.updatedAt = Date.now();
    if (match.status === "ended") {
      this.scheduleEndedMatchCleanup(match);
    }

    const result = {
      ok: true,
      match: this.snapshotMatch(match),
      matchSocketIds: this.matchSocketIds(match),
      action,
      playerId: currentPlayerId,
      state: cloneGameState(match.state),
      frames: simulation.frames,
      winner: match.state.winner,
      bot: true,
    };

    if (!match.state.winner) {
      this.maybeScheduleBotTurn(match);
    }
    return result;
  }

  markDisconnected(socketId) {
    const queueUpdate = this.removeSocketFromQueue(socketId);
    if (queueUpdate) {
      return { type: "queue", ...queueUpdate };
    }

    const location = this.socketLocations.get(socketId);
    if (!location || location.kind !== "match") {
      return null;
    }
    this.socketLocations.delete(socketId);
    const match = this.matches.get(location.matchId);
    if (!match) {
      return null;
    }

    const player = match.players.find((entry) => entry.socketId === socketId);
    if (player) {
      if (player.isBot || player.forfeited || player.replacedByBot || match.status !== "playing") {
        return null;
      }
      const now = Date.now();
      player.connected = false;
      player.disconnectedAt = now;
      player.graceExpiresAt = now + RECONNECT_GRACE_MS;
      player.leaveReason = "disconnect";
      this.setSystemMessage(
        match,
        `${player.displayName} left the match. ${player.displayName} has 30 seconds to rejoin.`,
      );
      this.scheduleReconnectTimeout(match, player);
      match.updatedAt = Date.now();
    }
    return {
      type: "match",
      match: this.snapshotMatch(match),
      matchSocketIds: this.matchSocketIds(match),
    };
  }
}

module.exports = {
  MatchmakingStore,
  RECONNECT_GRACE_MS,
  ENDED_MATCH_CLEANUP_MS,
  BOT_MOVE_DELAY_MS,
};
