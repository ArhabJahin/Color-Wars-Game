const crypto = require("node:crypto");
const {
  PLAYER_POOL,
  sanitizeAction,
  sanitizeClientId,
  sanitizeRoomCode,
  sanitizeRoomSettings,
  sanitizeUsername,
  createGameState,
  cloneGameState,
  getCurrentPlayerId,
  simulateAction,
} = require("./validation");

function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function makeShortCode(seed) {
  const hash = crypto.createHash("sha1").update(String(seed || crypto.randomUUID())).digest("hex");
  return hash.slice(0, 4).toUpperCase();
}

function cloneRoomPlayer(player) {
  return {
    clientId: player.clientId,
    colorId: player.colorId,
    colorName: player.colorName,
    accent: player.accent,
    username: player.username,
    displayName: player.displayName,
    isHost: player.isHost,
    ready: player.ready,
    connected: player.connected,
  };
}

class RoomStore {
  constructor() {
    this.rooms = new Map();
    this.socketRoomCodes = new Map();
  }

  generateRoomCode() {
    let code = randomRoomCode();
    while (this.rooms.has(code)) {
      code = randomRoomCode();
    }
    return code;
  }

  createRoom({ socketId, clientId, username, settings }) {
    const safeClientId = sanitizeClientId(clientId);
    if (!safeClientId) {
      return { ok: false, error: "Missing client id." };
    }
    const safeUsername = sanitizeUsername(username);
    if (!safeUsername.ok) {
      return { ok: false, error: safeUsername.error };
    }

    const room = {
      code: this.generateRoomCode(),
      hostClientId: safeClientId,
      settings: sanitizeRoomSettings(settings),
      status: "lobby",
      players: [],
      state: null,
      tossWinnerIndex: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    room.players.push(this.createPlayer({
      socketId,
      clientId: safeClientId,
      username: safeUsername.username,
      colorIndex: 0,
      isHost: true,
    }));
    this.refreshDisplayNames(room);
    this.rooms.set(room.code, room);
    this.socketRoomCodes.set(socketId, room.code);
    return { ok: true, room: this.snapshot(room), roomCode: room.code };
  }

  createPlayer({ socketId, clientId, username, colorIndex, isHost = false }) {
    const color = PLAYER_POOL[colorIndex];
    return {
      socketId,
      clientId,
      colorId: color.id,
      colorName: color.name,
      accent: color.accent,
      username,
      displayName: "",
      shortCode: makeShortCode(clientId),
      isHost,
      ready: isHost,
      connected: true,
    };
  }

  joinRoom({ socketId, clientId, roomCode, username }) {
    const code = sanitizeRoomCode(roomCode);
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: "Invalid room code." };
    }

    const safeClientId = sanitizeClientId(clientId);
    if (!safeClientId) {
      return { ok: false, error: "Missing client id." };
    }
    const safeUsername = sanitizeUsername(username);
    if (!safeUsername.ok) {
      return { ok: false, error: safeUsername.error };
    }

    const existing = room.players.find((player) => player.clientId === safeClientId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      existing.username = safeUsername.username;
      room.updatedAt = Date.now();
      this.refreshDisplayNames(room);
      this.socketRoomCodes.set(socketId, code);
      return { ok: true, room: this.snapshot(room), roomCode: code, reconnected: true };
    }

    if (room.status !== "lobby") {
      return { ok: false, error: "This match has already started." };
    }
    if (room.players.length >= room.settings.playerCount) {
      return { ok: false, error: "Room is full." };
    }

    room.players.push(this.createPlayer({
      socketId,
      clientId: safeClientId,
      username: safeUsername.username,
      colorIndex: room.players.length,
    }));
    room.updatedAt = Date.now();
    this.refreshDisplayNames(room);
    this.socketRoomCodes.set(socketId, code);
    return { ok: true, room: this.snapshot(room), roomCode: code };
  }

  setReady({ roomCode, clientId, ready }) {
    const room = this.rooms.get(sanitizeRoomCode(roomCode));
    if (!room) {
      return { ok: false, error: "Invalid room code." };
    }
    if (room.status !== "lobby") {
      return { ok: false, error: "Match already started." };
    }
    const player = room.players.find((entry) => entry.clientId === sanitizeClientId(clientId));
    if (!player) {
      return { ok: false, error: "You are not in this room." };
    }
    player.ready = player.isHost ? true : Boolean(ready);
    room.updatedAt = Date.now();
    return { ok: true, room: this.snapshot(room) };
  }

  startMatch({ roomCode, clientId }) {
    const room = this.rooms.get(sanitizeRoomCode(roomCode));
    if (!room) {
      return { ok: false, error: "Invalid room code." };
    }
    if (room.hostClientId !== sanitizeClientId(clientId)) {
      return { ok: false, error: "Only the host can start." };
    }
    if (room.status !== "lobby") {
      return { ok: false, error: "Match already started." };
    }
    if (room.players.length < room.settings.playerCount) {
      return { ok: false, error: "Waiting for players." };
    }
    if (!room.players.every((player) => player.connected && player.ready)) {
      return { ok: false, error: "Waiting for ready players." };
    }

    const players = PLAYER_POOL.slice(0, room.settings.playerCount);
    room.state = createGameState({
      rows: room.settings.rows,
      cols: room.settings.cols,
      players,
    });
    room.tossWinnerIndex = Math.floor(Math.random() * room.settings.playerCount);
    room.state.currentPlayerIndex = room.tossWinnerIndex;
    room.status = "playing";
    room.updatedAt = Date.now();
    return {
      ok: true,
      room: this.snapshot(room),
      state: cloneGameState(room.state),
      tossWinnerIndex: room.tossWinnerIndex,
    };
  }

  applyMove({ roomCode, clientId, action }) {
    const room = this.rooms.get(sanitizeRoomCode(roomCode));
    if (!room) {
      return { ok: false, error: "Invalid room code." };
    }
    if (room.status !== "playing" || !room.state) {
      return { ok: false, error: "Match has not started." };
    }
    const player = room.players.find((entry) => entry.clientId === sanitizeClientId(clientId));
    if (!player) {
      return { ok: false, error: "You are not in this room." };
    }
    if (!player.connected) {
      return { ok: false, error: "Player is disconnected." };
    }
    const currentPlayerId = getCurrentPlayerId(room.state);
    if (player.colorId !== currentPlayerId) {
      return { ok: false, error: "Not your turn." };
    }
    const safeAction = sanitizeAction(action);
    if (!safeAction) {
      return { ok: false, error: "Invalid move." };
    }

    const simulation = simulateAction(room.state, safeAction, currentPlayerId);
    if (!simulation.frames.length) {
      return { ok: false, error: "Illegal move." };
    }

    room.state = simulation.state;
    room.status = room.state.winner ? "ended" : "playing";
    room.updatedAt = Date.now();
    return {
      ok: true,
      room: this.snapshot(room),
      action: safeAction,
      playerId: currentPlayerId,
      state: cloneGameState(room.state),
      frames: simulation.frames,
      winner: room.state.winner,
    };
  }

  markDisconnected(socketId) {
    const roomCode = this.socketRoomCodes.get(socketId);
    if (!roomCode) {
      return null;
    }
    this.socketRoomCodes.delete(socketId);
    const room = this.rooms.get(roomCode);
    if (!room) {
      return null;
    }
    const player = room.players.find((entry) => entry.socketId === socketId);
    if (player) {
      player.connected = false;
      room.updatedAt = Date.now();
    }
    return this.snapshot(room);
  }

  refreshDisplayNames(room) {
    const seen = new Map();
    for (const player of room.players) {
      const baseName = player.username || `${player.colorName} #${player.shortCode}`;
      const key = baseName.toLowerCase();
      const count = seen.get(key) || 0;
      player.displayName = count === 0 ? baseName : `${baseName} ${player.shortCode.slice(0, 2)}`;
      seen.set(key, count + 1);
    }
  }

  snapshot(room) {
    return {
      code: room.code,
      hostClientId: room.hostClientId,
      settings: { ...room.settings },
      status: room.status,
      playerCount: room.settings.playerCount,
      players: room.players.map(cloneRoomPlayer),
      state: room.state ? cloneGameState(room.state) : null,
      tossWinnerIndex: room.tossWinnerIndex,
    };
  }
}

module.exports = {
  RoomStore,
};
