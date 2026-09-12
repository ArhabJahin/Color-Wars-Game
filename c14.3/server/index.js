const path = require("node:path");
const express = require("express");
const http = require("node:http");
const { Server } = require("socket.io");
const { MatchmakingStore } = require("./matchmaking");

const PORT = Number(process.env.PORT) || 5522;
const PUBLIC_DIR = path.resolve(__dirname, "..");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
  },
});
const matchmaking = new MatchmakingStore();

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

function emitQueueUpdate(queue, socketIds = []) {
  for (const socketId of socketIds) {
    io.to(socketId).emit("online:queueUpdate", { queue });
  }
}

function emitAffectedQueues(updates = []) {
  for (const update of updates) {
    if (update?.queue) {
      emitQueueUpdate(update.queue, update.recipients);
    }
  }
}

function joinMatchSockets(matchId, socketIds = []) {
  for (const socketId of socketIds) {
    io.sockets.sockets.get(socketId)?.join(matchId);
  }
}

function emitMatchStarted(started) {
  if (!started?.match) {
    return;
  }

  joinMatchSockets(started.match.id, started.matchSocketIds);
  io.to(started.match.id).emit("online:matchStarted", {
    match: started.match,
    state: started.match.state,
    tossWinnerIndex: started.match.tossWinnerIndex,
  });

  if (started.queue) {
    emitQueueUpdate(started.queue, started.queueSocketIds);
  }
}

function emitMatchUpdate(match, socketIds = []) {
  if (!match) {
    return;
  }
  joinMatchSockets(match.id, socketIds);
  io.to(match.id).emit("online:matchUpdate", { match });
}

function ack(callback, payload) {
  if (typeof callback === "function") {
    callback(payload);
  }
}

io.on("connection", (socket) => {
  socket.on("online:joinQueue", (payload = {}, callback) => {
    const result = matchmaking.joinQueue({
      socketId: socket.id,
      clientId: payload.clientId,
      username: payload.username,
      settings: payload.settings,
    });
    ack(callback, result);
    emitAffectedQueues(result.affectedQueues);
    if (!result.ok) {
      return;
    }
    if (result.started) {
      emitMatchStarted(result.started);
      return;
    }
    emitQueueUpdate(result.queue, result.recipients);
  });

  socket.on("online:cancelQueue", (payload = {}, callback) => {
    const result = matchmaking.cancelQueue({
      socketId: socket.id,
      clientId: payload.clientId,
    });
    ack(callback, result);
    if (result.ok) {
      emitAffectedQueues(result.updates);
      socket.emit("online:matchmakingCancelled", { message: "Matchmaking cancelled" });
    }
  });

  socket.on("online:reconnectMatch", (payload = {}, callback) => {
    const result = matchmaking.reconnectMatch({
      socketId: socket.id,
      clientId: payload.clientId,
      matchId: payload.matchId,
    });
    ack(callback, result);
    if (result.ok) {
      emitMatchUpdate(result.match, result.matchSocketIds);
    }
  });

  socket.on("online:updateProfile", (payload = {}, callback) => {
    const result = matchmaking.updateProfile({
      socketId: socket.id,
      clientId: payload.clientId,
      username: payload.username,
    });
    ack(callback, result);
    if (!result.ok) {
      return;
    }
    if (result.queue) {
      emitQueueUpdate(result.queue, result.recipients);
    }
    if (result.match) {
      emitMatchUpdate(result.match, result.matchSocketIds);
    }
  });

  socket.on("online:move", (payload = {}, callback) => {
    const result = matchmaking.applyMove({
      matchId: payload.matchId,
      clientId: payload.clientId,
      action: payload.action,
    });
    ack(callback, result.ok ? { ok: true } : result);
    if (result.ok) {
      joinMatchSockets(result.match.id, result.matchSocketIds);
      io.to(result.match.id).emit("online:moveApplied", {
        match: result.match,
        action: result.action,
        playerId: result.playerId,
        state: result.state,
        frames: result.frames,
        winner: result.winner,
      });
      emitMatchUpdate(result.match, result.matchSocketIds);
    }
  });

  socket.on("disconnect", () => {
    const result = matchmaking.markDisconnected(socket.id);
    if (!result) {
      return;
    }
    if (result.type === "queue") {
      emitQueueUpdate(result.queue, result.recipients);
    }
    if (result.type === "match") {
      emitMatchUpdate(result.match, result.matchSocketIds);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Color Wars online server listening on http://127.0.0.1:${PORT}`);
});
