const path = require("node:path");
const express = require("express");
const http = require("node:http");
const { Server } = require("socket.io");
const { RoomStore } = require("./rooms");

const PORT = Number(process.env.PORT) || 5522;
const PUBLIC_DIR = path.resolve(__dirname, "..");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
  },
});
const rooms = new RoomStore();

app.use((req, res, next) => {
  const blockedRoots = ["/server", "/.git"];
  if (blockedRoots.some((root) => req.path === root || req.path.startsWith(`${root}/`))) {
    res.status(404).end();
    return;
  }
  next();
});

app.use(express.static(PUBLIC_DIR));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

function emitRoom(room) {
  io.to(room.code).emit("online:room", room);
}

function ack(callback, payload) {
  if (typeof callback === "function") {
    callback(payload);
  }
}

io.on("connection", (socket) => {
  socket.on("online:createRoom", (payload = {}, callback) => {
    const result = rooms.createRoom({
      socketId: socket.id,
      clientId: payload.clientId,
      username: payload.username,
      settings: payload.settings,
    });
    if (!result.ok) {
      ack(callback, result);
      return;
    }
    socket.join(result.roomCode);
    ack(callback, result);
    emitRoom(result.room);
  });

  socket.on("online:joinRoom", (payload = {}, callback) => {
    const result = rooms.joinRoom({
      socketId: socket.id,
      clientId: payload.clientId,
      username: payload.username,
      roomCode: payload.roomCode,
    });
    if (!result.ok) {
      ack(callback, result);
      return;
    }
    socket.join(result.roomCode);
    ack(callback, result);
    emitRoom(result.room);
  });

  socket.on("online:setReady", (payload = {}, callback) => {
    const result = rooms.setReady({
      roomCode: payload.roomCode,
      clientId: payload.clientId,
      ready: payload.ready,
    });
    ack(callback, result);
    if (result.ok) {
      emitRoom(result.room);
    }
  });

  socket.on("online:startMatch", (payload = {}, callback) => {
    const result = rooms.startMatch({
      roomCode: payload.roomCode,
      clientId: payload.clientId,
    });
    ack(callback, result);
    if (result.ok) {
      io.to(result.room.code).emit("online:matchStarted", {
        room: result.room,
        state: result.state,
        tossWinnerIndex: result.tossWinnerIndex,
      });
      emitRoom(result.room);
    }
  });

  socket.on("online:move", (payload = {}, callback) => {
    const result = rooms.applyMove({
      roomCode: payload.roomCode,
      clientId: payload.clientId,
      action: payload.action,
    });
    ack(callback, result.ok ? { ok: true } : result);
    if (result.ok) {
      io.to(result.room.code).emit("online:moveApplied", {
        room: result.room,
        action: result.action,
        playerId: result.playerId,
        state: result.state,
        frames: result.frames,
        winner: result.winner,
      });
      emitRoom(result.room);
    }
  });

  socket.on("disconnect", () => {
    const room = rooms.markDisconnected(socket.id);
    if (room) {
      emitRoom(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Color Wars online server listening on http://127.0.0.1:${PORT}`);
});
