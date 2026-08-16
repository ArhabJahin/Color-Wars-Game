/* Flattened for direct browser loading without module support. */

const PLAYER_POOL = [
  { id: "red", name: "Red", accent: "#ff5a62" },
  { id: "blue", name: "Blue", accent: "#16bfe8" },
  { id: "green", name: "Green", accent: "#78d447" },
  { id: "amber", name: "Amber", accent: "#ffc43b" },
];

function getCapacity() {
  return 4;
}

function createBoard(rows, cols) {
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

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

function createGameState({ rows, cols, players }) {
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

function cloneGameState(state) {
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

function getCurrentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

function getCurrentPlayerId(state) {
  return getCurrentPlayer(state).id;
}

function getNeighbors(row, col, rows, cols) {
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

function countOwnedCells(state) {
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

function countOwnedDots(state) {
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

function haveAllPlayersStarted(state) {
  return state.players.every((player) => state.moveCounts[player.id] > 0);
}

function refreshEliminations(state) {
  const ownedCells = countOwnedCells(state);
  const allStarted = haveAllPlayersStarted(state);

  for (const player of state.players) {
    state.eliminated[player.id] =
      allStarted && state.moveCounts[player.id] > 0 && ownedCells[player.id] === 0;
  }
}

function getActivePlayers(state) {
  return state.players.filter((player) => !state.eliminated[player.id]);
}

function evaluateWinner(state) {
  refreshEliminations(state);
  const alive = getActivePlayers(state);
  if (alive.length === 1 && haveAllPlayersStarted(state)) {
    return alive[0].id;
  }
  return null;
}

function canPlayAction(state, action, playerId = getCurrentPlayerId(state)) {
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

function getLegalActions(state, playerId = getCurrentPlayerId(state)) {
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

function simulateAction(state, action, playerId = getCurrentPlayerId(state)) {
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

function encodeState(state, playerId) {
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

function getActionMask(state, playerId = getCurrentPlayerId(state)) {
  return state.board.flatMap((row) =>
    row.map((cell) => (canPlayAction(state, { row: cell.row, col: cell.col }, playerId) ? 1 : 0)),
  );
}

const STORAGE_KEY = "chain-reaction-ai-profile-v1";
const MAX_RECENT_OUTCOMES = 12;

function createEmptyGrid(rows = 12, cols = 12) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function createPlayerModel(seedData) {
  const profile = seedData
    ? cloneData(seedData)
    : {
        gamesPlayed: 0,
        humanWins: 0,
        aiWins: 0,
        recentOutcomes: [],
        moveHeatmap: createEmptyGrid(),
        openingPreferences: { corners: 0, edges: 0, center: 0 },
        regionCounts: { corners: 0, edges: 0, center: 0 },
        averageRiskSamples: [],
        aggressionSamples: [],
        chainPreferenceSamples: [],
        criticalTargetingMoves: 0,
        threatResponses: 0,
        threatIgnores: 0,
        moveCount: 0,
      };

  function ensureGrid(row, col) {
    while (profile.moveHeatmap.length <= row) {
      profile.moveHeatmap.push(Array.from({ length: Math.max(col + 1, 12) }, () => 0));
    }
    for (const heatRow of profile.moveHeatmap) {
      while (heatRow.length <= col) {
        heatRow.push(0);
      }
    }
  }

  return {
    recordMove(state, action, features) {
      ensureGrid(action.row, action.col);
      profile.moveHeatmap[action.row][action.col] += 1;
      profile.moveCount += 1;

      profile.regionCounts[features.region] += 1;
      if (state.moveCounts[features.playerId] === 0) {
        profile.openingPreferences[features.region] += 1;
      }

      profile.averageRiskSamples.push(features.riskScore);
      profile.aggressionSamples.push(features.aggressionScore);
      profile.chainPreferenceSamples.push(features.chainIntentScore);
      if (features.targetsCriticalCell) {
        profile.criticalTargetingMoves += 1;
      }
      if (features.respondsToThreat) {
        profile.threatResponses += 1;
      } else if (features.ignoredThreat) {
        profile.threatIgnores += 1;
      }
    },

    summarizeTendencies() {
      const moveCount = Math.max(profile.moveCount, 1);
      const preferredRegion = Object.entries(profile.regionCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "center";
      const opening = Object.entries(profile.openingPreferences)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "center";
      const avgRisk = average(profile.averageRiskSamples);
      const aggression = average(profile.aggressionSamples);
      const chainBias = average(profile.chainPreferenceSamples);
      const criticalRate = profile.criticalTargetingMoves / moveCount;
      const threatResponseRate =
        profile.threatResponses / Math.max(profile.threatResponses + profile.threatIgnores, 1);

      const traits = [];
      if (preferredRegion === "corners") traits.push("player leans on corners");
      if (preferredRegion === "edges") traits.push("player prefers edge buildup");
      if (preferredRegion === "center") traits.push("player contests the center");
      if (avgRisk > 0.62) traits.push("takes volatile critical fights");
      if (avgRisk < 0.35) traits.push("keeps a conservative shape");
      if (aggression > 0.55) traits.push("presses captures early");
      if (chainBias > 0.45) traits.push("hunts chain reactions");
      if (criticalRate > 0.38) traits.push("targets near-critical cells");
      if (threatResponseRate > 0.6) traits.push("usually answers local threats");

      return {
        preferredRegion,
        opening,
        averageRisk: avgRisk,
        aggression,
        chainBias,
        criticalRate,
        threatResponseRate,
        summary: traits.length ? `Adaptive read: ${traits.slice(0, 2).join(", ")}.` : "Adaptive read: profile still warming up.",
      };
    },

    getBiasAdjustments(candidateMoves) {
      const summary = this.summarizeTendencies();
      const adjustments = new Map();

      for (const move of candidateMoves) {
        let score = 0;

        if (summary.preferredRegion === "corners" && move.features.region === "corners") {
          score += 2.6;
        }
        if (summary.preferredRegion === "edges" && move.features.region === "edges") {
          score += 1.7;
        }
        if (summary.preferredRegion === "center" && move.features.region === "center") {
          score += 1.2;
        }
        if (summary.criticalRate > 0.35 && move.features.protectsCriticalCells) {
          score += 1.8;
        }
        if (summary.averageRisk > 0.6 && move.features.createsTrap) {
          score += 2.1;
        }
        if (summary.averageRisk < 0.4 && move.features.expansionValue > 0.5) {
          score += 1.4;
        }
        if (summary.chainBias > 0.45 && move.features.blocksOpponentChain) {
          score += 2.4;
        }
        if (summary.aggression > 0.55 && move.features.defensiveValue > 0.4) {
          score += 1.6;
        }
        if (summary.threatResponseRate > 0.6 && move.features.invitesOverreaction) {
          score += 1.2;
        }

        adjustments.set(`${move.action.row},${move.action.col}`, score);
      }

      return adjustments;
    },

    recordOutcome({ didHumanWin, difficulty }) {
      profile.gamesPlayed += 1;
      if (didHumanWin) {
        profile.humanWins += 1;
      } else {
        profile.aiWins += 1;
      }

      profile.recentOutcomes.unshift({
        didHumanWin,
        difficulty,
        timestamp: Date.now(),
      });
      profile.recentOutcomes = profile.recentOutcomes.slice(0, MAX_RECENT_OUTCOMES);
    },

    exportSnapshot() {
      return cloneData(profile);
    },

    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    },

    load() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }

      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
  };
}

const DIFFICULTY_PRESETS = {
  easy: {
    searchDepth: 0,
    beamWidth: 4,
    randomness: 0.22,
    adaptiveStrength: 0.15,
    weights: {
      ownedCells: 5,
      ownedDots: 2.5,
      criticalOwned: 3.6,
      vulnerableCritical: -4.8,
      immediateExplosion: 3.5,
      chainPotential: 4.5,
      opponentExposure: -5.8,
      mobility: 1.4,
      eliminationPressure: 7,
      positional: 1.2,
      defensive: 2,
      traps: 1.7,
    },
  },
  medium: {
    searchDepth: 1,
    beamWidth: 5,
    randomness: 0.08,
    adaptiveStrength: 0.3,
    weights: {
      ownedCells: 6.5,
      ownedDots: 3,
      criticalOwned: 4.4,
      vulnerableCritical: -6.2,
      immediateExplosion: 4.2,
      chainPotential: 6.2,
      opponentExposure: -6.8,
      mobility: 2,
      eliminationPressure: 10,
      positional: 1.6,
      defensive: 3,
      traps: 2.8,
    },
  },
  hard: {
    searchDepth: 2,
    beamWidth: 6,
    randomness: 0.02,
    adaptiveStrength: 0.4,
    weights: {
      ownedCells: 7.2,
      ownedDots: 3.6,
      criticalOwned: 5.4,
      vulnerableCritical: -7.4,
      immediateExplosion: 5,
      chainPotential: 7.2,
      opponentExposure: -7.6,
      mobility: 2.4,
      eliminationPressure: 12,
      positional: 2.1,
      defensive: 4,
      traps: 3.6,
    },
  },
  adaptive: {
    searchDepth: 2,
    beamWidth: 7,
    randomness: 0.01,
    adaptiveStrength: 0.95,
    weights: {
      ownedCells: 7.4,
      ownedDots: 3.8,
      criticalOwned: 5.8,
      vulnerableCritical: -7.8,
      immediateExplosion: 5.4,
      chainPotential: 7.8,
      opponentExposure: -8.2,
      mobility: 2.5,
      eliminationPressure: 12.5,
      positional: 2.2,
      defensive: 4.4,
      traps: 4.1,
    },
  },
};

function getDifficultyConfig(difficulty) {
  return DIFFICULTY_PRESETS[difficulty] ?? DIFFICULTY_PRESETS.medium;
}

function getRegion(state, row, col) {
  const isCorner =
    (row === 0 || row === state.rows - 1) &&
    (col === 0 || col === state.cols - 1);
  if (isCorner) {
    return "corners";
  }
  const isEdge = row === 0 || row === state.rows - 1 || col === 0 || col === state.cols - 1;
  if (isEdge) {
    return "edges";
  }
  return "center";
}

function isCriticalCell(cell) {
  return cell.count === cell.capacity - 1 && cell.owner !== null;
}

function isVulnerableCritical(state, cell, playerId) {
  if (cell.owner !== playerId || !isCriticalCell(cell)) {
    return false;
  }

  return getNeighbors(cell.row, cell.col, state.rows, state.cols).some((neighbor) => {
    const adjacent = state.board[neighbor.row][neighbor.col];
    return adjacent.owner && adjacent.owner !== playerId && adjacent.count >= adjacent.capacity - 1;
  });
}

function countCriticalCells(state, playerId) {
  let count = 0;
  let vulnerable = 0;
  for (const row of state.board) {
    for (const cell of row) {
      if (cell.owner === playerId && isCriticalCell(cell)) {
        count += 1;
        if (isVulnerableCritical(state, cell, playerId)) {
          vulnerable += 1;
        }
      }
    }
  }
  return { count, vulnerable };
}

function estimateChainPotential(state, playerId) {
  let total = 0;
  for (const row of state.board) {
    for (const cell of row) {
      if (cell.owner === playerId) {
        const delta = Math.max(0, cell.count - (cell.capacity - 2));
        total += delta;
      }
    }
  }
  return total;
}

function estimateOpponentExposure(state, playerId) {
  let exposure = 0;
  for (const row of state.board) {
    for (const cell of row) {
      if (cell.owner === playerId && cell.count > 0) {
        for (const neighbor of getNeighbors(cell.row, cell.col, state.rows, state.cols)) {
          const adjacent = state.board[neighbor.row][neighbor.col];
          if (adjacent.owner && adjacent.owner !== playerId && adjacent.count >= adjacent.capacity - 1) {
            exposure += 1;
          }
        }
      }
    }
  }
  return exposure;
}

function estimatePositionalValue(state, playerId) {
  let total = 0;
  for (const row of state.board) {
    for (const cell of row) {
      if (cell.owner !== playerId) {
        continue;
      }
      const region = getRegion(state, cell.row, cell.col);
      total += region === "corners" ? 1.3 : region === "edges" ? 1 : 0.8;
      if (cell.count >= cell.capacity - 1) {
        total += 0.4;
      }
    }
  }
  return total;
}

function getOpponentIds(state, playerId) {
  return state.players
    .map((player) => player.id)
    .filter((candidateId) => candidateId !== playerId && !state.eliminated[candidateId]);
}

function evaluateState(state, playerId, playerModel = null, difficulty = "medium") {
  const config = getDifficultyConfig(difficulty);
  const opponentIds = getOpponentIds(state, playerId);
  const ownedCells = countOwnedCells(state);
  const ownedDots = countOwnedDots(state);
  const critical = countCriticalCells(state, playerId);
  const chainPotential = estimateChainPotential(state, playerId);
  const exposure = estimateOpponentExposure(state, playerId);
  const mobility = getLegalActions(state, playerId).length;
  const positional = estimatePositionalValue(state, playerId);

  const eliminationPressure = opponentIds.reduce((sum, opponentId) => {
    return sum + (state.eliminated[opponentId] ? 1 : 0);
  }, 0);

  const opponentScore = opponentIds.reduce((sum, opponentId) => {
    const opponentCritical = countCriticalCells(state, opponentId);
    const opponentExposure = estimateOpponentExposure(state, opponentId);
    return (
      sum +
      ownedCells[opponentId] * 4 +
      ownedDots[opponentId] * 2 +
      opponentCritical.count * 2 -
      opponentExposure * 1.4
    );
  }, 0);

  let score =
    ownedCells[playerId] * config.weights.ownedCells +
    ownedDots[playerId] * config.weights.ownedDots +
    critical.count * config.weights.criticalOwned +
    critical.vulnerable * config.weights.vulnerableCritical +
    chainPotential * config.weights.chainPotential +
    exposure * config.weights.opponentExposure +
    mobility * config.weights.mobility +
    eliminationPressure * config.weights.eliminationPressure +
    positional * config.weights.positional -
    opponentScore;

  if (state.winner === playerId) {
    score += 100000;
  } else if (state.winner && state.winner !== playerId) {
    score -= 100000;
  }

  if (playerModel && difficulty === "adaptive") {
    const tendencies = playerModel.summarizeTendencies();
    if (tendencies.preferredRegion === "corners") {
      score += positional * 0.3;
    }
    if (tendencies.averageRisk > 0.6) {
      score += chainPotential * 0.4 - exposure * 0.2;
    }
  }

  return score;
}

function getThreatMap(state, playerId) {
  const threatened = new Set();
  for (const row of state.board) {
    for (const cell of row) {
      if (cell.owner !== playerId) {
        continue;
      }
      if (isVulnerableCritical(state, cell, playerId)) {
        threatened.add(`${cell.row},${cell.col}`);
      }
    }
  }
  return threatened;
}

function extractMoveFeatures(state, action, playerId) {
  const currentCell = state.board[action.row][action.col];
  const region = getRegion(state, action.row, action.col);
  const threatMapBefore = getThreatMap(state, playerId);
  const simulation = simulateAction(state, action, playerId);
  const nextState = simulation.state;
  const threatMapAfter = getThreatMap(nextState, playerId);
  const opponentIds = getOpponentIds(state, playerId);
  const targetsCriticalCell = currentCell.owner !== null && currentCell.owner !== playerId && isCriticalCell(currentCell);
  const chainBursts = simulation.frames.length - 1;
  const defensiveRelief = threatMapBefore.size - threatMapAfter.size;
  const ownedBefore = countOwnedCells(state)[playerId];
  const ownedAfter = countOwnedCells(nextState)[playerId];
  const opponentExposureBefore = estimateOpponentExposure(state, playerId);
  const opponentExposureAfter = estimateOpponentExposure(nextState, playerId);

  const riskScore = currentCell.capacity > 0
    ? Math.max(0, currentCell.count + 1 - (currentCell.capacity - 1)) / currentCell.capacity
    : 0;
  const aggressionScore = Math.max(
    0,
    opponentIds.reduce((sum, opponentId) => {
      const before = countOwnedCells(state)[opponentId];
      const after = countOwnedCells(nextState)[opponentId];
      return sum + Math.max(0, before - after);
    }, 0) / 3,
  );

  return {
    playerId,
    region,
    targetsCriticalCell,
    riskScore,
    aggressionScore: Math.min(1, aggressionScore),
    chainIntentScore: Math.min(1, chainBursts / 3),
    respondsToThreat: defensiveRelief > 0,
    ignoredThreat: threatMapBefore.size > 0 && defensiveRelief <= 0,
    createsTrap: opponentExposureAfter < opponentExposureBefore && chainBursts > 0,
    blocksOpponentChain: defensiveRelief > 0,
    protectsCriticalCells: defensiveRelief > 0,
    invitesOverreaction: region === "corners" && defensiveRelief > 0,
    expansionValue: Math.max(0, ownedAfter - ownedBefore) / 4,
    defensiveValue: Math.max(0, defensiveRelief) / 4,
    immediateExplosion: chainBursts > 0 ? 1 : 0,
  };
}

function scoreMove(state, action, playerId, difficulty, playerModel) {
  const config = getDifficultyConfig(difficulty);
  const simulation = simulateAction(state, action, playerId);
  const nextState = simulation.state;
  const features = extractMoveFeatures(state, action, playerId);
  const total =
    evaluateState(nextState, playerId, playerModel, difficulty) +
    features.immediateExplosion * config.weights.immediateExplosion +
    features.defensiveValue * config.weights.defensive +
    (features.createsTrap ? 1 : 0) * config.weights.traps;

  return {
    action,
    nextState,
    features,
    score: total,
  };
}

function minimax(state, rootPlayerId, depth, difficulty, playerModel, alpha, beta) {
  if (depth === 0 || state.winner) {
    return evaluateState(state, rootPlayerId, playerModel, difficulty);
  }

  const currentPlayerId = getCurrentPlayerId(state);
  const actions = getLegalActions(state, currentPlayerId);
  if (!actions.length) {
    return evaluateState(state, rootPlayerId, playerModel, difficulty);
  }

  const maximizing = currentPlayerId === rootPlayerId;
  const orderedMoves = actions
    .map((action) => scoreMove(state, action, currentPlayerId, difficulty, playerModel))
    .sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score))
    .slice(0, getDifficultyConfig(difficulty).beamWidth);

  if (maximizing) {
    let value = -Infinity;
    for (const move of orderedMoves) {
      value = Math.max(
        value,
        minimax(move.nextState, rootPlayerId, depth - 1, difficulty, playerModel, alpha, beta),
      );
      alpha = Math.max(alpha, value);
      if (alpha >= beta) {
        break;
      }
    }
    return value;
  }

  let value = Infinity;
  for (const move of orderedMoves) {
    value = Math.min(
      value,
      minimax(move.nextState, rootPlayerId, depth - 1, difficulty, playerModel, alpha, beta),
    );
    beta = Math.min(beta, value);
    if (alpha >= beta) {
      break;
    }
  }
  return value;
}

function chooseAiAction(state, difficulty = "medium", playerModel = null) {
  const playerId = getCurrentPlayerId(state);
  const config = getDifficultyConfig(difficulty);
  const legalActions = getLegalActions(state, playerId);

  if (!legalActions.length) {
    return {
      action: { row: 0, col: 0 },
      reasoningSummary: "No legal moves available.",
    };
  }

  const candidateMoves = legalActions.map((action) => scoreMove(state, action, playerId, difficulty, playerModel));
  const adaptiveBiases = playerModel
    ? playerModel.getBiasAdjustments(candidateMoves, state)
    : new Map();

  for (const move of candidateMoves) {
    const lookup = adaptiveBiases.get(`${move.action.row},${move.action.col}`) ?? 0;
    move.score += lookup * config.adaptiveStrength;

    if (config.searchDepth > 0) {
      move.score += minimax(
        move.nextState,
        playerId,
        config.searchDepth,
        difficulty,
        playerModel,
        -Infinity,
        Infinity,
      ) * 0.35;
    }
  }

  candidateMoves.sort((a, b) => b.score - a.score);

  let chosenMove = candidateMoves[0];
  if (config.randomness > 0 && candidateMoves.length > 1 && Math.random() < config.randomness) {
    const topChoices = candidateMoves.slice(0, Math.min(3, candidateMoves.length));
    chosenMove = topChoices[Math.floor(Math.random() * topChoices.length)];
  }

  const tendencySummary = playerModel?.summarizeTendencies()?.summary ?? "";
  return {
    action: chosenMove.action,
    reasoningSummary: [
      `${difficulty} search rated ${candidateMoves.length} legal moves.`,
      chosenMove.features.createsTrap ? "Chosen line creates a trap." : "Chosen line keeps the board stable.",
      tendencySummary,
    ].filter(Boolean).join(" "),
  };
}

function createTrainingScaffolding() {
  const trajectory = [];

  return {
    collectTrajectoryStep(state, action, reward, nextState, done) {
      trajectory.push({
        state: cloneGameState(state),
        encodedState: encodeState(state, getCurrentPlayerId(state)),
        action,
        actionMask: getActionMask(state, getCurrentPlayerId(state)),
        reward,
        nextState: cloneGameState(nextState),
        done,
      });
    },

    runSelfPlayEpisode(initialState, difficulty = "hard", maxSteps = 256) {
      let state = cloneGameState(initialState);
      let steps = 0;

      while (!state.winner && steps < maxSteps) {
        const choice = chooseAiAction(state, difficulty, null);
        const next = simulateAction(state, choice.action, getCurrentPlayerId(state)).state;
        this.collectTrajectoryStep(state, choice.action, 0, next, Boolean(next.winner));
        state = next;
        steps += 1;
      }

      return { finalState: state, steps, trajectory: [...trajectory] };
    },

    exportTrainingSample() {
      return JSON.stringify(trajectory);
    },

    importPolicyWeights(weights) {
      return {
        accepted: Boolean(weights),
        note: "Placeholder hook. Swap this out with PPO or AlphaZero-lite policy/value weights later.",
      };
    },

    policyPrior(state) {
      const actions = getLegalActions(state, getCurrentPlayerId(state));
      return actions.map((action) => ({ action, prior: 1 / Math.max(actions.length, 1) }));
    },

    encodeState,
  };
}

const BOARD_PRESETS = {
  "5x5": { rows: 5, cols: 5 },
  "6x8": { rows: 6, cols: 8 },
  "9x6": { rows: 9, cols: 6 },
};

const INITIAL_PRESET = "5x5";
const ANIMATION_STEP_MS = 95;
const AI_DELAY_RANGE_MS = { min: 360, max: 760 };

const boardElement = document.getElementById("board");
const boardFxElement = document.getElementById("boardFx");
const cellTemplate = document.getElementById("cellTemplate");
const playerCardTemplate = document.getElementById("playerCardTemplate");
const turnBanner = document.getElementById("turnBanner");
const messageElement = document.getElementById("message");
const legendElement = document.getElementById("legend");
const presetSelect = document.getElementById("presetSelect");
const playerCountSelect = document.getElementById("playerCountSelect");
const rowsInput = document.getElementById("rowsInput");
const colsInput = document.getElementById("colsInput");
const applyButton = document.getElementById("applyButton");
const undoButton = document.getElementById("undoButton");
const restartButton = document.getElementById("restartButton");
const boardShellElement = document.querySelector(".board-shell");
const modeSelect = document.getElementById("modeSelect");
const aiSeatSelect = document.getElementById("aiSeatSelect");
const aiDifficultySelect = document.getElementById("aiDifficultySelect");
const aiStatusElement = document.getElementById("aiStatus");
const playButton = document.getElementById("playButton");
const introPanel = document.getElementById("introPanel");
const backButton = document.querySelector(".back-button");

const uiState = {
  game: null,
  history: [],
  resolving: false,
  mode: "human",
  aiSeat: "second",
  aiDifficulty: "medium",
  aiTurnTimer: null,
  lastMessage: "",
};

let playerModel = createPlayerModel();
let lastVisualTurn = null;

function isPrimaryColorSwap(fromTurn, toTurn) {
  return (
    (fromTurn === "red" && toTurn === "blue") ||
    (fromTurn === "blue" && toTurn === "red")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function animateElement(element, keyframes, options) {
  if (!element?.animate) {
    return;
  }
  element.animate(keyframes, options);
}

function animateBoardRefresh() {
}

function animateTurnChange() {
  animateElement(
    turnBanner,
    [
      { transform: "translateX(-50%) translateY(10px)", opacity: 0.45 },
      { transform: "translateX(-50%) translateY(0)", opacity: 1 },
    ],
    {
      duration: 420,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  );
}

function animateStatusMessage() {
  animateElement(
    messageElement,
    [
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    {
      duration: 300,
      easing: "ease-out",
    },
  );
}

function animateControl(element) {
  animateElement(
    element,
    [
      { opacity: 0.7 },
      { opacity: 1 },
    ],
    {
      duration: 240,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  );
}

function closeIntro() {
  document.body.classList.remove("intro-open");
}

function getAiPlayerId() {
  if (uiState.mode !== "ai") {
    return null;
  }
  return uiState.aiSeat === "first" ? uiState.game.players[0].id : uiState.game.players[1].id;
}

function getHumanPlayerId() {
  if (uiState.mode !== "ai") {
    return null;
  }
  return uiState.aiSeat === "first" ? uiState.game.players[1].id : uiState.game.players[0].id;
}

function isAiTurn() {
  return uiState.mode === "ai" && getCurrentPlayerId(uiState.game) === getAiPlayerId();
}

function clearAiTimer() {
  if (uiState.aiTurnTimer !== null) {
    clearTimeout(uiState.aiTurnTimer);
    uiState.aiTurnTimer = null;
  }
}

function clampSize(value) {
  return Math.max(3, Math.min(12, Number(value) || 0));
}

function setInputsFromState() {
  rowsInput.value = String(uiState.game.rows);
  colsInput.value = String(uiState.game.cols);
  playerCountSelect.value = String(uiState.game.players.length);
  modeSelect.value = uiState.mode;
  aiSeatSelect.value = uiState.aiSeat;
  aiDifficultySelect.value = uiState.aiDifficulty;

  const matchedPreset = Object.entries(BOARD_PRESETS).find(
    ([, preset]) => preset.rows === uiState.game.rows && preset.cols === uiState.game.cols,
  );
  presetSelect.value = matchedPreset ? matchedPreset[0] : "custom";
}

function setModeControls() {
  const isAiMode = uiState.mode === "ai";
  aiSeatSelect.disabled = !isAiMode || uiState.resolving;
  aiDifficultySelect.disabled = !isAiMode || uiState.resolving;
  playerCountSelect.disabled = isAiMode || uiState.resolving;
  if (isAiMode) {
    playerCountSelect.value = "2";
  }
}

function updateAiStatus(extra = "") {
  if (uiState.mode !== "ai") {
    aiStatusElement.textContent = "Human vs Human mode.";
    return;
  }

  const tendencies = playerModel.summarizeTendencies();
  const difficultyLabel =
    uiState.aiDifficulty.charAt(0).toUpperCase() + uiState.aiDifficulty.slice(1);
  const summary = [
    `${difficultyLabel} AI profile active.`,
    tendencies.summary,
    extra,
  ].filter(Boolean);

  aiStatusElement.textContent = summary.join(" ");
}

function renderLegend() {
  const ownedDots = countOwnedDots(uiState.game);
  legendElement.innerHTML = "";

  for (const [index, player] of uiState.game.players.entries()) {
    const card = playerCardTemplate.content.firstElementChild.cloneNode(true);
    const score = card.querySelector(".player-score");
    const isCurrent = !uiState.game.winner && index === uiState.game.currentPlayerIndex;
    const isEliminated = uiState.game.eliminated[player.id];

    card.classList.add(`pos-${index}`);
    card.classList.toggle("active", isCurrent);
    card.classList.toggle("eliminated", isEliminated);
    card.style.setProperty("--accent", player.accent);
    score.textContent = String(ownedDots[player.id]);
    legendElement.appendChild(card);
  }
}

function canInteractWithCell(cell) {
  if (uiState.resolving || uiState.game.winner || isAiTurn()) {
    return false;
  }

  const legalActions = getLegalActions(uiState.game, getCurrentPlayerId(uiState.game));
  return legalActions.some((action) => action.row === cell.row && action.col === cell.col);
}

function renderBoard(highlights = []) {
  const highlightSet = new Set(highlights.map(({ row, col }) => `${row},${col}`));
  boardElement.style.gridTemplateColumns = `repeat(${uiState.game.cols}, minmax(0, 1fr))`;
  boardElement.innerHTML = "";

  for (let row = 0; row < uiState.game.rows; row += 1) {
    for (let col = 0; col < uiState.game.cols; col += 1) {
      const cell = uiState.game.board[row][col];
      const button = cellTemplate.content.firstElementChild.cloneNode(true);
      const dotsContainer = button.querySelector(".dots");
      const capacityElement = button.querySelector(".cell-capacity");
      const owner = cell.owner
        ? uiState.game.players.find((player) => player.id === cell.owner)
        : null;
      const isPlayable = canInteractWithCell(cell);
      const blocked = !isPlayable && !uiState.resolving && !uiState.game.winner;

      button.dataset.row = String(row);
      button.dataset.col = String(col);
      button.disabled = !isPlayable;
      button.classList.add(owner ? owner.id : "empty");
      button.classList.toggle("blocked", blocked);
      button.classList.toggle("just-updated", highlightSet.has(`${row},${col}`));
      button.classList.toggle("overloaded", cell.count >= cell.capacity && cell.count > 0);
      button.setAttribute("aria-disabled", String(!isPlayable));
      button.setAttribute(
        "aria-label",
        `${row + 1},${col + 1} ${owner ? owner.name : "empty"} ${cell.count}/${cell.capacity}`,
      );
      capacityElement.textContent = `${cell.capacity}`;

      if (cell.count > 0) {
        const pipCount = Math.min(cell.count, 4);
        const orb = document.createElement("span");
        orb.className = `orb ${owner ? owner.id : "empty"} count-${pipCount} pip-count-${pipCount}`;

        for (let i = 0; i < pipCount; i += 1) {
          const pip = document.createElement("span");
          pip.className = "pip";
          orb.appendChild(pip);
        }

        dotsContainer.appendChild(orb);
      }

      boardElement.appendChild(button);
    }
  }

  renderLegend();
  syncStatus();
  updateAiStatus();
  if (highlights.length > 0) {
    animateBoardRefresh();
  }
}

function syncStatus() {
  const currentPlayer = getCurrentPlayer(uiState.game);
  const visualTurn = uiState.game.winner ?? currentPlayer.id;
  const accentPlayer =
    uiState.game.players.find((player) => player.id === visualTurn) ?? currentPlayer;
  const primarySwap = isPrimaryColorSwap(lastVisualTurn, visualTurn);

  document.body.dataset.turn = visualTurn;
  document.body.style.setProperty("--turn-accent", accentPlayer.accent);
  document.body.classList.toggle("is-primary-swap", primarySwap);
  boardShellElement.classList.toggle("is-resolving", uiState.resolving);
  boardShellElement.classList.toggle("is-ai-thinking", isAiTurn() && !uiState.resolving);
  turnBanner.dataset.turn = visualTurn;
  turnBanner.textContent = uiState.game.winner
    ? `${uiState.game.players.find((player) => player.id === uiState.game.winner).name} wins`
    : `${currentPlayer.name} to move`;

  if (lastVisualTurn !== visualTurn) {
    animateTurnChange();
    lastVisualTurn = visualTurn;
  }

  const canUndo = uiState.history.length > 0 && !uiState.resolving;
  if (undoButton.disabled === canUndo) {
    animateControl(undoButton);
  }
  undoButton.disabled = !canUndo;
  setModeControls();
}

function updateStatus(message) {
  if (uiState.lastMessage !== message) {
    animateStatusMessage();
    uiState.lastMessage = message;
  }
  messageElement.textContent = message;
  syncStatus();
}

function pushHistory() {
  uiState.history.push({
    game: cloneGameState(uiState.game),
    mode: uiState.mode,
    aiSeat: uiState.aiSeat,
    aiDifficulty: uiState.aiDifficulty,
    playerModel: playerModel.exportSnapshot(),
  });

  if (uiState.history.length > 80) {
    uiState.history.shift();
  }
}

function getCellCenter(row, col) {
  const cellElement = boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  if (!cellElement) {
    return null;
  }

  const cellRect = cellElement.getBoundingClientRect();
  const boardRect = boardFxElement.getBoundingClientRect();

  return {
    x: cellRect.left - boardRect.left + (cellRect.width / 2),
    y: cellRect.top - boardRect.top + (cellRect.height / 2),
  };
}

function spawnBurst(row, col, ownerId) {
  return;
  const center = getCellCenter(row, col);
  if (!center || !ownerId) {
    return;
  }

  const burst = document.createElement("span");
  burst.className = `burst-wave ${ownerId}`;
  burst.style.left = `${center.x}px`;
  burst.style.top = `${center.y}px`;
  boardFxElement.appendChild(burst);
  burst.addEventListener("animationend", () => burst.remove(), { once: true });
}

async function animateTransfers(transfers = []) {
  if (!transfers.length || !boardFxElement) {
    return;
  }

  boardFxElement.innerHTML = "";
  const animations = [];
  const burstKeys = new Set();

  for (const transfer of transfers) {
    const from = getCellCenter(transfer.from.row, transfer.from.col);
    const to = getCellCenter(transfer.to.row, transfer.to.col);
    if (!from || !to) {
      continue;
    }

    const burstKey = `${transfer.from.row},${transfer.from.col},${transfer.ownerId}`;
    if (!burstKeys.has(burstKey)) {
      burstKeys.add(burstKey);
      spawnBurst(transfer.from.row, transfer.from.col, transfer.ownerId);
    }

    const particle = document.createElement("span");
    particle.className = `transfer-particle ${transfer.ownerId}`;
    particle.style.left = `${from.x}px`;
    particle.style.top = `${from.y}px`;
    boardFxElement.appendChild(particle);

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
    const curve = Math.min(38, Math.max(18, distance * 0.22));
    const arcX = (dx * 0.5) + (-dy / distance) * curve;
    const arcY = (dy * 0.5) + (dx / distance) * curve;

    const animation = particle.animate(
      [
        {
          transform: "translate(-50%, -50%) translate(0px, 0px)",
          opacity: 0,
        },
        {
          transform: `translate(-50%, -50%) translate(${arcX}px, ${arcY}px)`,
          opacity: 1,
          offset: 0.52,
        },
        {
          transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px)`,
          opacity: 0.1,
        },
      ],
      {
        duration: 520,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      },
    );

    animation.finished
      .catch(() => null)
      .finally(() => particle.remove());

    animations.push(animation.finished.catch(() => null));
  }

  await Promise.all(animations);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function playFrame(frame, delay = ANIMATION_STEP_MS) {
  uiState.game.board = frame.board.map((boardRow) => boardRow.map((cell) => ({ ...cell })));
  renderBoard(frame.highlights);
  updateStatus(frame.message);
  await nextFrame();
  await animateTransfers(frame.transfers);
  await sleep(delay);
}

function createMatchState({ rows, cols, playerCount }) {
  const players = PLAYER_POOL.slice(0, playerCount);
  return createGameState({ rows, cols, players });
}

function resetGame({
  rows = uiState.game?.rows ?? BOARD_PRESETS[INITIAL_PRESET].rows,
  cols = uiState.game?.cols ?? BOARD_PRESETS[INITIAL_PRESET].cols,
  playerCount = uiState.mode === "ai" ? 2 : Number(playerCountSelect.value || 2),
} = {}) {
  clearAiTimer();
  uiState.game = createMatchState({ rows, cols, playerCount });
  uiState.history = [];
  uiState.resolving = false;
  lastVisualTurn = null;
  setInputsFromState();
  renderBoard();
  updateStatus("Each player may claim any empty cell on their first turn, then may play only on their own cells.");
  maybeScheduleAiTurn("AI preparing opening book.");
}

function captureHumanMoveForModel(action) {
  if (uiState.mode !== "ai") {
    return;
  }

  const humanPlayerId = getHumanPlayerId();
  const features = extractMoveFeatures(uiState.game, action, humanPlayerId);
  playerModel.recordMove(uiState.game, action, features);
  playerModel.save();
}

function finalizeMatch(lastActorId) {
  if (!uiState.game.winner || uiState.mode !== "ai") {
    return;
  }

  const humanWon = uiState.game.winner === getHumanPlayerId();
  playerModel.recordOutcome({
    didHumanWin: humanWon,
    difficulty: uiState.aiDifficulty,
    winnerId: lastActorId,
  });
  playerModel.save();
  updateAiStatus(humanWon ? "AI logged the loss and will counter those patterns next game." : "AI stored the win pattern.");
}

async function commitMove(action, actorLabel) {
  const currentPlayer = getCurrentPlayer(uiState.game);
  const legalActions = getLegalActions(uiState.game, currentPlayer.id);
  const isLegal = legalActions.some(
    (candidate) => candidate.row === action.row && candidate.col === action.col,
  );

  if (!isLegal) {
    updateStatus(
      uiState.game.moveCounts[currentPlayer.id] === 0
        ? "On your first turn, choose any empty cell or one already controlled by you."
        : "After your first turn, you can place dots only in cells already controlled by you.",
    );
    return;
  }

  clearAiTimer();
  pushHistory();
  if (actorLabel === "human") {
    captureHumanMoveForModel(action);
  }

  uiState.resolving = true;
  renderBoard();

  const simulation = simulateAction(uiState.game, action, currentPlayer.id);
  for (const [index, frame] of simulation.frames.entries()) {
    const delay = index === 0 ? 130 : ANIMATION_STEP_MS;
    await playFrame(frame, delay);
  }

  uiState.game = simulation.state;
  uiState.resolving = false;
  renderBoard();

  if (uiState.game.winner) {
    updateStatus(`${currentPlayer.name} dominates the entire board.`);
    finalizeMatch(currentPlayer.id);
    return;
  }

  const nextPlayer = getCurrentPlayer(uiState.game);
  updateStatus(
    actorLabel === "ai"
      ? `AI stabilized the board. ${nextPlayer.name} is up next.`
      : `Board stabilized. ${nextPlayer.name} is up next.`,
  );
  maybeScheduleAiTurn("AI is adapting to the latest move pattern.");
}

function maybeScheduleAiTurn(reason = "") {
  clearAiTimer();
  if (!isAiTurn() || uiState.resolving || uiState.game.winner) {
    return;
  }

  updateAiStatus(reason || "AI is reading your move heatmap.");
  updateStatus("AI is thinking...");
  const delay =
    AI_DELAY_RANGE_MS.min +
    Math.floor(Math.random() * (AI_DELAY_RANGE_MS.max - AI_DELAY_RANGE_MS.min));

  uiState.aiTurnTimer = window.setTimeout(async () => {
    uiState.aiTurnTimer = null;
    if (!isAiTurn() || uiState.resolving || uiState.game.winner) {
      return;
    }

    const choice = chooseAiAction(uiState.game, uiState.aiDifficulty, playerModel);
    updateAiStatus(choice.reasoningSummary);
    await commitMove(choice.action, "ai");
  }, delay);
}

function handleBoardClick(event) {
  const button = event.target.closest(".cell");
  if (!button || uiState.resolving || isAiTurn()) {
    return;
  }

  commitMove(
    { row: Number(button.dataset.row), col: Number(button.dataset.col) },
    "human",
  );
}

function handleUndo() {
  if (uiState.history.length === 0 || uiState.resolving) {
    return;
  }

  clearAiTimer();
  const previous = uiState.history.pop();
  uiState.game = cloneGameState(previous.game);
  uiState.mode = previous.mode;
  uiState.aiSeat = previous.aiSeat;
  uiState.aiDifficulty = previous.aiDifficulty;
  playerModel = createPlayerModel(previous.playerModel);
  playerModel.save();
  uiState.resolving = false;
  uiState.lastMessage = "";
  setInputsFromState();
  renderBoard();
  updateStatus("Previous turn restored.");
}

function applyPreset() {
  const preset = BOARD_PRESETS[presetSelect.value];
  if (!preset) {
    return;
  }

  rowsInput.value = String(preset.rows);
  colsInput.value = String(preset.cols);
}

function handleNewMatch() {
  if (uiState.resolving) {
    return;
  }

  uiState.mode = modeSelect.value;
  uiState.aiSeat = aiSeatSelect.value;
  uiState.aiDifficulty = aiDifficultySelect.value;

  const rows = clampSize(rowsInput.value);
  const cols = clampSize(colsInput.value);
  const playerCount = uiState.mode === "ai"
    ? 2
    : Math.max(2, Math.min(4, Number(playerCountSelect.value) || 2));

  rowsInput.value = String(rows);
  colsInput.value = String(cols);
  resetGame({ rows, cols, playerCount });
  updateStatus(
    uiState.mode === "ai"
      ? `New ${rows} x ${cols} Human vs AI match started.`
      : `New ${rows} x ${cols} match started for ${playerCount} players.`,
  );
  closeIntro();
}

function handleModeChange() {
  uiState.mode = modeSelect.value;
  if (uiState.mode === "ai") {
    playerCountSelect.value = "2";
  }
  setModeControls();
  updateAiStatus();
}

function handleAiConfigChange() {
  uiState.aiSeat = aiSeatSelect.value;
  uiState.aiDifficulty = aiDifficultySelect.value;
  updateAiStatus();
}

function initializeApp() {
  const restoredProfile = playerModel.load();
  if (restoredProfile) {
    playerModel = createPlayerModel(restoredProfile);
  }

  const rlHooks = createTrainingScaffolding();
  window.chainReactionTraining = {
    ...rlHooks,
    encodeState: (playerId) => rlHooks.encodeState(uiState.game, playerId),
    getActionMask: (playerId) => getActionMask(uiState.game, playerId),
  };

  uiState.mode = modeSelect.value;
  uiState.aiSeat = aiSeatSelect.value;
  uiState.aiDifficulty = aiDifficultySelect.value;

  boardElement.addEventListener("click", handleBoardClick);
  undoButton.addEventListener("click", handleUndo);
  restartButton.addEventListener("click", () =>
    resetGame({
      rows: uiState.game.rows,
      cols: uiState.game.cols,
      playerCount: uiState.game.players.length,
    }));
  applyButton.addEventListener("click", handleNewMatch);
  presetSelect.addEventListener("change", applyPreset);
  modeSelect.addEventListener("change", handleModeChange);
  aiSeatSelect.addEventListener("change", handleAiConfigChange);
  aiDifficultySelect.addEventListener("change", handleAiConfigChange);
  playButton?.addEventListener("click", closeIntro);
  backButton?.addEventListener("click", closeIntro);
  introPanel?.addEventListener("click", (event) => {
    if (event.target === introPanel) {
      closeIntro();
    }
  });

  resetGame({
    rows: BOARD_PRESETS[INITIAL_PRESET].rows,
    cols: BOARD_PRESETS[INITIAL_PRESET].cols,
    playerCount: 2,
  });
}

initializeApp();
