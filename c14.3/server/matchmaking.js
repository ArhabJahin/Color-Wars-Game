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

function makeShortCode(seed) {
  const hash = crypto.createHash("sha1").update(String(seed || crypto.randomUUID())).digest("hex");
  return hash.slice(0, 4).toUpperCase();
}

function makeMatchId() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
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
      const baseName = player.username || `${player.colorName} #${player.shortCode}`;
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
    return match.players.map((player) => player.socketId).filter(Boolean);
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
    };
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

    const existingMatch = this.findMatchByClientId(safeClientId);
    if (existingMatch && existingMatch.match.status === "playing") {
      return { ok: false, error: "You are already in a match." };
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
    const safeMatchId = String(matchId ?? "").trim().toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 16);
    const match = this.matches.get(safeMatchId);
    if (!safeClientId || !match) {
      return { ok: false, error: "Reconnect unavailable." };
    }

    const player = match.players.find((entry) => entry.clientId === safeClientId);
    if (!player) {
      return { ok: false, error: "You are not in this match." };
    }

    player.socketId = socketId;
    player.connected = true;
    match.updatedAt = Date.now();
    this.socketLocations.set(socketId, { kind: "match", matchId: match.id });
    this.refreshDisplayNames(match.players);
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
      player.connected = false;
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
};
