export const PLAYER_POOL = [
  { id: "red", name: "Red", accent: "#ff5a62" },
  { id: "blue", name: "Blue", accent: "#16bfe8" },
  { id: "green", name: "Green", accent: "#78d447" },
  { id: "amber", name: "Amber", accent: "#ffc43b" },
];

export function getCapacity() {
  return 4;
}

export function createBoard(rows, cols) {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      row,
      col,
      owner: null,
      count: 0,
      capacity: getCapacity(row, col, rows, cols),
    })),
  );
}

export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

export function createGameState({ rows, cols, players }) {
  return {
    rows,
    cols,
    board: createBoard(rows, cols),
    players: players.map((player) => ({ ...player })),
    currentPlayerIndex: 0,
    moveCounts: Object.fromEntries(players.map((player) => [player.id, 0])),
    eliminated: Object.fromEntries(players.map((player) => [player.id, false])),
    winner: null,
  };
}

export function cloneGameState(state) {
  return {
    rows: state.rows,
    cols: state.cols,
    board: cloneBoard(state.board),
    players: state.players.map((player) => ({ ...player })),
    currentPlayerIndex: state.currentPlayerIndex,
    moveCounts: { ...state.moveCounts },
    eliminated: { ...state.eliminated },
    winner: state.winner,
  };
}

export function getCurrentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

export function getCurrentPlayerId(state) {
  return getCurrentPlayer(state).id;
}

export function getNeighbors(row, col, rows, cols) {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ].filter(({ row: nextRow, col: nextCol }) =>
    nextRow >= 0 &&
    nextRow < rows &&
    nextCol >= 0 &&
    nextCol < cols,
  );
}

export function countOwnedCells(state) {
  const totals = Object.fromEntries(state.players.map((player) => [player.id, 0]));

  for (const row of state.board) {
    for (const cell of row) {
      if (cell.owner && totals[cell.owner] !== undefined) {
        totals[cell.owner] += 1;
      }
    }
  }

  return totals;
}

export function countOwnedDots(state) {
  const totals = Object.fromEntries(state.players.map((player) => [player.id, 0]));

  for (const row of state.board) {
    for (const cell of row) {
      if (cell.owner && totals[cell.owner] !== undefined) {
        totals[cell.owner] += cell.count;
      }
    }
  }

  return totals;
}

export function haveAllPlayersStarted(state) {
  return state.players.every((player) => state.moveCounts[player.id] > 0);
}

export function refreshEliminations(state) {
  const ownedCells = countOwnedCells(state);
  const allStarted = haveAllPlayersStarted(state);

  for (const player of state.players) {
    state.eliminated[player.id] =
      allStarted && state.moveCounts[player.id] > 0 && ownedCells[player.id] === 0;
  }
}

export function getActivePlayers(state) {
  return state.players.filter((player) => !state.eliminated[player.id]);
}

export function evaluateWinner(state) {
  refreshEliminations(state);
  const alive = getActivePlayers(state);
  if (alive.length === 1 && haveAllPlayersStarted(state)) {
    return alive[0].id;
  }
  return null;
}

export function canPlayAction(state, action, playerId = getCurrentPlayerId(state)) {
  if (state.winner) {
    return false;
  }

  const cell = state.board[action.row]?.[action.col];
  if (!cell) {
    return false;
  }

  if (cell.owner === playerId) {
    return true;
  }

  return cell.owner === null && state.moveCounts[playerId] === 0;
}

export function getLegalActions(state, playerId = getCurrentPlayerId(state)) {
  const actions = [];
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      const action = { row, col };
      if (canPlayAction(state, action, playerId)) {
        actions.push(action);
      }
    }
  }
  return actions;
}

function collectExplosions(state) {
  const overloaded = [];
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      const cell = state.board[row][col];
      if (cell.count >= cell.capacity && cell.capacity > 0) {
        overloaded.push({ row, col, ownerId: cell.owner });
      }
    }
  }
  return overloaded;
}

function getNextActivePlayerIndex(state, fromIndex) {
  for (let step = 1; step <= state.players.length; step += 1) {
    const candidateIndex = (fromIndex + step) % state.players.length;
    const candidate = state.players[candidateIndex];
    if (!state.eliminated[candidate.id]) {
      return candidateIndex;
    }
  }
  return fromIndex;
}

export function simulateAction(state, action, playerId = getCurrentPlayerId(state)) {
  if (!canPlayAction(state, action, playerId)) {
    return { state: cloneGameState(state), frames: [] };
  }

  const player = state.players.find((entry) => entry.id === playerId);
  const nextState = cloneGameState(state);
  const frames = [];

  nextState.board[action.row][action.col].count += 1;
  nextState.board[action.row][action.col].owner = playerId;
  frames.push({
    board: cloneBoard(nextState.board),
    highlights: [{ row: action.row, col: action.col }],
    message: `${player.name} charges ${action.row + 1},${action.col + 1}.`,
    transfers: [],
  });

  while (true) {
    const explosions = collectExplosions(nextState);
    if (explosions.length === 0) {
      break;
    }

    const highlights = [];
    const transfers = [];

    for (const { row, col, ownerId } of explosions) {
      const cell = nextState.board[row][col];
      const explosionOwnerId = ownerId ?? playerId;

      cell.count = 0;
      cell.owner = null;
      highlights.push({ row, col });

      for (const neighbor of getNeighbors(row, col, nextState.rows, nextState.cols)) {
        const nextCell = nextState.board[neighbor.row][neighbor.col];
        nextCell.count += 1;
        nextCell.owner = explosionOwnerId;
        highlights.push(neighbor);
        transfers.push({
          from: { row, col },
          to: neighbor,
          ownerId: explosionOwnerId,
        });
      }
    }

    frames.push({
      board: cloneBoard(nextState.board),
      highlights,
      message: `${player.name} sets off a chain reaction.`,
      transfers,
    });
  }

  nextState.moveCounts[playerId] += 1;
  nextState.winner = evaluateWinner(nextState);
  if (!nextState.winner) {
    nextState.currentPlayerIndex = getNextActivePlayerIndex(nextState, nextState.currentPlayerIndex);
  }

  return { state: nextState, frames };
}

export function encodeState(state, playerId) {
  const opponentIds = state.players
    .map((player) => player.id)
    .filter((candidateId) => candidateId !== playerId);

  const encoded = [];
  for (const row of state.board) {
    for (const cell of row) {
      encoded.push(cell.owner === playerId ? 1 : 0);
      encoded.push(cell.owner && opponentIds.includes(cell.owner) ? 1 : 0);
      encoded.push(cell.count / Math.max(cell.capacity, 1));
      encoded.push((cell.capacity - cell.count) / Math.max(cell.capacity, 1));
    }
  }

  encoded.push(state.moveCounts[playerId] / Math.max(state.rows * state.cols, 1));
  encoded.push(opponentIds.reduce((sum, opponentId) => sum + state.moveCounts[opponentId], 0));
  encoded.push(getCurrentPlayerId(state) === playerId ? 1 : 0);
  return encoded;
}

export function getActionMask(state, playerId = getCurrentPlayerId(state)) {
  return state.board.flatMap((row) =>
    row.map((cell) => (canPlayAction(state, { row: cell.row, col: cell.col }, playerId) ? 1 : 0)),
  );
}
