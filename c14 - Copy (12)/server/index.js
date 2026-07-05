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

function emitMoveApplied(result) {
  if (!result?.ok) {
    return;
  }
  joinMatchSockets(result.match.id, result.matchSocketIds);
  io.to(result.match.id).emit("online:moveApplied", {
    match: result.match,
    revision: result.match.revision || 0,
    action: result.action,
    playerId: result.playerId,
    state: result.state,
    frames: result.frames,
    winner: result.winner,
    bot: Boolean(result.bot),
    timeoutMove: Boolean(result.timeoutMove),
    noLegalMove: Boolean(result.noLegalMove),
  });
  emitMatchUpdate(result.match, result.matchSocketIds);
}

function ack(callback, payload) {
  if (typeof callback === "function") {
    callback(payload);
  }
}

matchmaking.setEventHandlers({
  onMatchUpdate: emitMatchUpdate,
  onBotMove: emitMoveApplied,
});

io.on("connection", (socket) => {
  socket.on("online:getActiveMatch", (payload = {}, callback) => {
    const result = matchmaking.getActiveMatch({
      socketId: socket.id,
      clientId: payload.clientId,
      matchId: payload.matchId,
    });
    ack(callback, result);
  });

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

  socket.on("online:forfeitMatch", (payload = {}, callback) => {
    const result = matchmaking.forfeitMatch({
      socketId: socket.id,
      clientId: payload.clientId,
      matchId: payload.matchId,
    });
    if (result.clearMatchId && result.match?.id) {
      socket.leave(result.match.id);
    }
    ack(callback, result);
  });

  socket.on("online:leaveMatchView", (payload = {}, callback) => {
    const result = matchmaking.markLeftMatchView({
      socketId: socket.id,
      clientId: payload.clientId,
      matchId: payload.matchId,
    });
    if (result.ok && result.match?.id) {
      socket.leave(result.match.id);
      emitMatchUpdate(result.match, result.matchSocketIds);
    }
    ack(callback, result);
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
      emitMoveApplied(result);
    }
  });

  socket.on("online:animationComplete", (payload = {}, callback) => {
    const result = matchmaking.markAnimationComplete({
      matchId: payload.matchId,
      clientId: payload.clientId,
      revision: payload.revision,
    });
    ack(callback, result.ok ? { ok: true } : result);
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
