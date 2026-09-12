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
  "7x7": { rows: 7, cols: 7 },
};

const INITIAL_PRESET = "5x5";
const ANIMATION_STEP_MS = 220;
const AI_DELAY_RANGE_MS = { min: 480, max: 1100 };
const HOLD_TO_OPTIONS_MS = 950;
const HOLD_BACK_LABEL = "Hold to return to options";
const WIN_BACK_LABEL = "Return to game menu";
const TOSS_SPIN_MS = 1900;
const TOSS_REVEAL_MS = 850;
const THEME_STORAGE_KEY = "chain-reaction-theme";
const DEFAULT_THEME = "light";
const VALID_THEMES = new Set(["light", "dark"]);
const SOUND_STORAGE_KEY = "chain-reaction-sound-muted";
const SOUND_VOLUME_STORAGE_KEY = "chain-reaction-sound-volume";
const SOUND_MASTER_GAIN = 3.4;
const SOUND_DEFAULT_VOLUME = 1;
const SOUND_MIN_VOLUME = 0.3;
const SOUND_MAX_VOLUME = 1;
const SOUND_VOLUME_STEP = 0.15;
const USERNAME_STORAGE_KEY = "chain-reaction-username";
const CLIENT_ID_STORAGE_KEY = "chain-reaction-client-id";
const ONLINE_MATCH_STORAGE_KEY = "chain-reaction-online-match-id";
const ONLINE_SOCKET_SCRIPT = "/socket.io/socket.io.js";
const USERNAME_PATTERN = /^[A-Za-z0-9 _-]{3,16}$/;

const boardElement = document.getElementById("board");
const boardFxElement = document.getElementById("boardFx");
const cellTemplate = document.getElementById("cellTemplate");
const playerCardTemplate = document.getElementById("playerCardTemplate");
const turnBanner = document.getElementById("turnBanner");
const messageElement = document.getElementById("message");
const legendElement = document.getElementById("legend");
const presetSelect = document.getElementById("presetSelect");
const playerCountSelect = document.getElementById("playerCountSelect");
const applyButton = document.getElementById("applyButton");
const undoButton = document.getElementById("undoButton");
const restartButton = document.getElementById("restartButton");
const boardShellElement = document.querySelector(".board-shell");
const modeSelect = document.getElementById("modeSelect");
const aiSeatSelect = document.getElementById("aiSeatSelect");
const aiDifficultySelect = document.getElementById("aiDifficultySelect");
const aiStatusElement = document.getElementById("aiStatus");
const playButton = document.getElementById("playButton");
const backButton = document.querySelector(".back-button");
const gameBackButton = document.getElementById("gameBackButton");
const settingsButton = document.getElementById("settingsButton");
const settingsBackButton = document.getElementById("settingsBackButton");
const settingsPanel = document.getElementById("settingsPanel");
const themeToggleButton = document.getElementById("themeToggle");
const themeValueElement = document.getElementById("themeValue");
const soundToggleButton = document.getElementById("soundToggle");
const volumeDownButton = document.getElementById("volumeDownButton");
const volumeUpButton = document.getElementById("volumeUpButton");
const volumeValueElement = document.getElementById("volumeValue");
const usernameInput = document.getElementById("usernameInput");
const usernameSaveButton = document.getElementById("usernameSaveButton");
const usernameStatus = document.getElementById("usernameStatus");
const onlineLobby = document.getElementById("onlineLobby");
const onlineStatus = document.getElementById("onlineStatus");
const onlineJoinedCount = document.getElementById("onlineJoinedCount");
const onlineMatchSummary = document.getElementById("onlineMatchSummary");
const onlineCancelButton = document.getElementById("onlineCancelButton");
const onlinePlayerList = document.getElementById("onlinePlayerList");
const tossOverlay = document.getElementById("tossOverlay");
const tossRing = document.getElementById("tossRing");
const tossCoin = document.getElementById("tossCoin");
const tossCoinText = document.getElementById("tossCoinText");
const tossResult = document.getElementById("tossResult");
const setupSelectElements = [
  modeSelect,
  aiDifficultySelect,
  presetSelect,
  playerCountSelect,
].filter(Boolean);
const customSelectControls = new Map();

const uiState = {
  game: null,
  history: [],
  resolving: false,
  mode: "human",
  aiSeat: "second",
  aiDifficulty: "medium",
  aiTurnTimer: null,
  lastMessage: "",
  tossing: false,
};

const onlineState = {
  socket: null,
  socketClientPromise: null,
  clientId: "",
  queue: null,
  match: null,
  matchId: "",
  matchmaking: false,
  moving: false,
  reconnecting: false,
  status: "Press PLAY to search for players.",
};

let playerModel = createPlayerModel();
let lastVisualTurn = null;

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const soundState = {
  context: null,
  masterGain: null,
  unlocked: false,
  supported: Boolean(AudioContextClass),
  muted: false,
  volume: SOUND_DEFAULT_VOLUME,
  lastChainPopAt: 0,
  unlockPromise: null,
  tossSpinTimer: null,
  tossSpinStep: 0,
};

function isPrimaryColorSwap(fromTurn, toTurn) {
  return (
    (fromTurn === "red" && toTurn === "blue") ||
    (fromTurn === "blue" && toTurn === "red")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClientId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `cw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getClientId() {
  if (onlineState.clientId) {
    return onlineState.clientId;
  }

  try {
    const savedClientId = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (savedClientId) {
      onlineState.clientId = savedClientId;
      return savedClientId;
    }
    const nextClientId = createClientId();
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, nextClientId);
    onlineState.clientId = nextClientId;
    return nextClientId;
  } catch {
    onlineState.clientId = onlineState.clientId || createClientId();
    return onlineState.clientId;
  }
}

function validateUsername(value) {
  const username = String(value ?? "").trim();
  if (!username) {
    return { ok: true, username: "" };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      username: "",
      error: "Use 3-16 letters, numbers, spaces, underscores, or hyphens.",
    };
  }
  return { ok: true, username };
}

function getSavedUsername() {
  try {
    return localStorage.getItem(USERNAME_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function setUsernameStatus(message, isError = false) {
  if (!usernameStatus) {
    return;
  }
  usernameStatus.textContent = message;
  usernameStatus.classList.toggle("is-error", isError);
}

function refreshUsernameControls() {
  const savedUsername = getSavedUsername();
  if (usernameInput && document.activeElement !== usernameInput) {
    usernameInput.value = savedUsername;
  }
  setUsernameStatus(savedUsername ? `Saved as ${savedUsername}` : "Optional for online matches");
}

function saveUsername() {
  const result = validateUsername(usernameInput?.value);
  if (!result.ok) {
    setUsernameStatus(result.error, true);
    return null;
  }

  try {
    if (result.username) {
      localStorage.setItem(USERNAME_STORAGE_KEY, result.username);
      setUsernameStatus(`Saved as ${result.username}`);
    } else {
      localStorage.removeItem(USERNAME_STORAGE_KEY);
      setUsernameStatus("Username cleared; online matches will use color code.");
    }
  } catch {
    setUsernameStatus("Could not save username in this browser.", true);
    return null;
  }

  if (onlineState.queue || onlineState.match) {
    updateOnlineProfileInMatchmaking();
  }
  return result.username;
}

function getSavedTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return VALID_THEMES.has(savedTheme) ? savedTheme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function updateThemeButton(theme) {
  if (themeValueElement) {
    themeValueElement.textContent = theme === "dark" ? "Dark" : "Light";
  }

  if (!themeToggleButton) {
    return;
  }

  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${nextTheme} theme`;
  themeToggleButton.setAttribute("aria-label", label);
  themeToggleButton.title = label;
}

function applyTheme(theme, { persist = true } = {}) {
  const nextTheme = VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;
  document.body.dataset.theme = nextTheme;

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Theme persistence is optional; the visual state still applies.
    }
  }

  updateThemeButton(nextTheme);
}

function toggleTheme() {
  const currentTheme = document.body.dataset.theme || DEFAULT_THEME;
  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

function getSavedSoundMuted() {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function clampSoundVolume(value) {
  return Math.max(SOUND_MIN_VOLUME, Math.min(SOUND_MAX_VOLUME, value));
}

function getSavedSoundVolume() {
  try {
    const savedValue = localStorage.getItem(SOUND_VOLUME_STORAGE_KEY);
    if (savedValue === null) {
      return SOUND_DEFAULT_VOLUME;
    }

    const savedVolume = Number(savedValue);
    return Number.isFinite(savedVolume) ? clampSoundVolume(savedVolume) : SOUND_DEFAULT_VOLUME;
  } catch {
    return SOUND_DEFAULT_VOLUME;
  }
}

function getSoundGainValue() {
  return soundState.muted ? 0.0001 : SOUND_MASTER_GAIN * soundState.volume;
}

function updateVolumeDisplay() {
  if (!volumeValueElement) {
    return;
  }

  const volumePercent = Math.round(soundState.volume * 100);
  volumeValueElement.textContent = `Volume ${volumePercent}%`;
}

function updateSoundButton() {
  const volumePercent = Math.round(soundState.volume * 100);
  updateVolumeDisplay();

  if (soundToggleButton) {
    const label = soundState.muted ? `Unmute sound, volume ${volumePercent}%` : `Mute sound, volume ${volumePercent}%`;
    soundToggleButton.classList.toggle("is-muted", soundState.muted);
    soundToggleButton.setAttribute("aria-label", label);
    soundToggleButton.setAttribute("aria-pressed", String(soundState.muted));
    soundToggleButton.title = label;
    soundToggleButton.disabled = !soundState.supported;

    if (!soundState.supported) {
      soundToggleButton.setAttribute("aria-label", "Sound unavailable");
      soundToggleButton.title = "Sound unavailable";
    }
  }

  if (volumeDownButton) {
    volumeDownButton.disabled = !soundState.supported || soundState.volume <= SOUND_MIN_VOLUME;
    volumeDownButton.setAttribute("aria-label", `Decrease sound volume, current ${volumePercent}%`);
    volumeDownButton.title = `Decrease sound volume (${volumePercent}%)`;
  }

  if (volumeUpButton) {
    volumeUpButton.disabled = !soundState.supported || soundState.volume >= SOUND_MAX_VOLUME;
    volumeUpButton.setAttribute("aria-label", `Increase sound volume, current ${volumePercent}%`);
    volumeUpButton.title = `Increase sound volume (${volumePercent}%)`;
  }
}

function setSoundMuted(isMuted, { persist = true } = {}) {
  soundState.muted = Boolean(isMuted);

  if (soundState.masterGain && soundState.context) {
    try {
      const now = soundState.context.currentTime;
      soundState.masterGain.gain.cancelScheduledValues(now);
      soundState.masterGain.gain.setTargetAtTime(
        getSoundGainValue(),
        now,
        0.018,
      );
    } catch {
      // Muting should never break gameplay if browser audio controls fail.
    }
  }

  if (persist) {
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, String(soundState.muted));
    } catch {
      // Sound preference persistence is optional.
    }
  }

  updateSoundButton();
}

function setSoundVolume(volume, { persist = true } = {}) {
  soundState.volume = clampSoundVolume(volume);

  if (soundState.masterGain && soundState.context) {
    try {
      const now = soundState.context.currentTime;
      soundState.masterGain.gain.cancelScheduledValues(now);
      soundState.masterGain.gain.setTargetAtTime(getSoundGainValue(), now, 0.018);
    } catch {
      // Volume changes are cosmetic; keep gameplay running if audio fails.
    }
  }

  if (persist) {
    try {
      localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(soundState.volume));
    } catch {
      // Sound preference persistence is optional.
    }
  }

  updateSoundButton();
}

function changeSoundVolume(delta) {
  if (!soundState.supported) {
    return;
  }

  const nextVolume = clampSoundVolume(soundState.volume + delta);
  if (nextVolume === soundState.volume) {
    return;
  }

  setSoundVolume(nextVolume);

  if (soundState.muted && delta > 0) {
    setSoundMuted(false);
  }

  playGameSound(delta > 0 ? "volumeUp" : "volumeDown");
}

function ensureAudioContext() {
  if (!soundState.supported) {
    return null;
  }

  if (soundState.context) {
    return soundState.context;
  }

  try {
    const context = new AudioContextClass();
    const masterGain = context.createGain();
    masterGain.gain.value = getSoundGainValue();
    masterGain.connect(context.destination);

    soundState.context = context;
    soundState.masterGain = masterGain;
    return context;
  } catch {
    soundState.supported = false;
    updateSoundButton();
    return null;
  }
}

async function unlockAudio() {
  if (soundState.unlockPromise) {
    return soundState.unlockPromise;
  }

  const context = ensureAudioContext();
  if (!context) {
    return false;
  }

  soundState.unlockPromise = (async () => {
    try {
      if (context.state === "suspended") {
        await context.resume();
      }

      soundState.unlocked = context.state === "running";

      if (soundState.unlocked) {
        const now = context.currentTime;
        const primer = context.createOscillator();
        const primerGain = context.createGain();
        primer.frequency.value = 440;
        primerGain.gain.setValueAtTime(0.0001, now);
        primerGain.gain.exponentialRampToValueAtTime(0.00001, now + 0.018);
        primer.connect(primerGain);
        primerGain.connect(soundState.masterGain);
        primer.start(now);
        primer.stop(now + 0.02);
      }

      return soundState.unlocked;
    } catch {
      return false;
    } finally {
      soundState.unlockPromise = null;
    }
  })();

  return soundState.unlockPromise;
}

function canPlaySound() {
  return (
    soundState.supported &&
    !soundState.muted &&
    soundState.context &&
    soundState.masterGain &&
    soundState.context.state === "running"
  );
}

function playTone({
  type = "sine",
  frequency = 440,
  endFrequency = frequency,
  delay = 0,
  duration = 0.07,
  gain = 0.045,
  pan = 0,
} = {}) {
  if (!canPlaySound()) {
    return;
  }

  try {
    const context = soundState.context;
    const startAt = context.currentTime + delay;
    const stopAt = startAt + duration;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), stopAt);
    }

    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.linearRampToValueAtTime(gain, startAt + Math.min(0.012, duration * 0.35));
    envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    oscillator.connect(envelope);
    if (context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-0.8, Math.min(0.8, pan)), startAt);
      envelope.connect(panner);
      panner.connect(soundState.masterGain);
    } else {
      envelope.connect(soundState.masterGain);
    }

    oscillator.start(startAt);
    oscillator.stop(stopAt + 0.025);
  } catch {
    // Generated sound is cosmetic; ignore audio graph failures.
  }
}

function playGameSound(name, options = {}) {
  if (soundState.muted || !soundState.supported) {
    return;
  }

  if (!canPlaySound()) {
    unlockAudio().then((unlocked) => {
      if (unlocked && !soundState.muted) {
        playGameSound(name, options);
      }
    });
    return;
  }

  if (!canPlaySound()) {
    return;
  }

  switch (name) {
    case "uiTap":
      playTone({
        type: "sine",
        frequency: 540,
        endFrequency: 720,
        duration: 0.065,
        gain: 0.07,
      });
      break;

    case "placement":
      playTone({
        type: "triangle",
        frequency: 340,
        endFrequency: 520,
        duration: 0.095,
        gain: 0.088,
      });
      playTone({
        type: "sine",
        frequency: 780,
        endFrequency: 640,
        delay: 0.026,
        duration: 0.065,
        gain: 0.034,
      });
      break;

    case "chainPop": {
      const now = performance.now();
      if (now - soundState.lastChainPopAt < 70) {
        return;
      }
      soundState.lastChainPopAt = now;
      const intensity = Math.min(Math.max(Number(options.intensity) || 1, 1), 4);
      playTone({
        type: "sine",
        frequency: 620,
        endFrequency: 800,
        duration: 0.07,
        gain: 0.042 + intensity * 0.004,
      });
      break;
    }

    case "tossStart":
      playTone({
        type: "sine",
        frequency: 430,
        endFrequency: 560,
        duration: 0.105,
        gain: 0.06,
      });
      playTone({
        type: "sine",
        frequency: 640,
        endFrequency: 760,
        delay: 0.07,
        duration: 0.095,
        gain: 0.04,
      });
      break;

    case "tossReveal":
      playTone({
        type: "triangle",
        frequency: 580,
        endFrequency: 870,
        duration: 0.14,
        gain: 0.075,
      });
      break;

    case "tossSpin": {
      const step = Number(options.step) || 0;
      const phase = step * 0.72;
      playTone({
        type: "sine",
        frequency: 520 + Math.sin(phase) * 42,
        endFrequency: 575 + Math.cos(phase) * 34,
        duration: 0.075,
        gain: 0.075,
        pan: Math.sin(phase) * 0.42,
      });
      playTone({
        type: "triangle",
        frequency: 780 + Math.cos(phase) * 38,
        endFrequency: 720 + Math.sin(phase) * 28,
        delay: 0.035,
        duration: 0.055,
        gain: 0.038,
        pan: Math.sin(phase + Math.PI) * 0.34,
      });
      break;
    }

    case "turn":
      playTone({
        type: "sine",
        frequency: 420,
        endFrequency: 500,
        duration: 0.045,
        gain: 0.026,
      });
      break;

    case "volumeUp":
      playTone({
        type: "sine",
        frequency: 600,
        endFrequency: 820,
        duration: 0.085,
        gain: 0.07,
      });
      break;

    case "volumeDown":
      playTone({
        type: "sine",
        frequency: 620,
        endFrequency: 460,
        duration: 0.075,
        gain: 0.055,
      });
      break;

    case "win":
      playTone({
        type: "triangle",
        frequency: 392,
        endFrequency: 440,
        duration: 0.17,
        gain: 0.115,
      });
      playTone({
        type: "sine",
        frequency: 523.25,
        endFrequency: 587.33,
        delay: 0.085,
        duration: 0.18,
        gain: 0.11,
      });
      playTone({
        type: "triangle",
        frequency: 659.25,
        endFrequency: 739.99,
        delay: 0.17,
        duration: 0.2,
        gain: 0.095,
      });
      playTone({
        type: "sine",
        frequency: 783.99,
        endFrequency: 880,
        delay: 0.27,
        duration: 0.24,
        gain: 0.085,
      });
      playTone({
        type: "sine",
        frequency: 523.25,
        delay: 0.43,
        duration: 0.42,
        gain: 0.06,
        pan: -0.16,
      });
      playTone({
        type: "sine",
        frequency: 659.25,
        delay: 0.43,
        duration: 0.42,
        gain: 0.05,
      });
      playTone({
        type: "triangle",
        frequency: 783.99,
        delay: 0.43,
        duration: 0.42,
        gain: 0.044,
        pan: 0.16,
      });
      break;

    default:
      break;
  }
}

function playUiTap() {
  if (soundState.muted || !soundState.supported) {
    return;
  }

  if (soundState.unlocked) {
    playGameSound("uiTap");
    return;
  }

  unlockAudio().then((unlocked) => {
    if (unlocked) {
      playGameSound("uiTap");
    }
  });
}

function stopTossSpinSound() {
  if (soundState.tossSpinTimer !== null) {
    window.clearInterval(soundState.tossSpinTimer);
    soundState.tossSpinTimer = null;
  }
}

function startTossSpinSound(durationMs = TOSS_SPIN_MS) {
  stopTossSpinSound();

  if (soundState.muted || !soundState.supported) {
    return;
  }

  const startedAt = performance.now();
  soundState.tossSpinStep = 0;

  const tick = () => {
    if (performance.now() - startedAt >= durationMs) {
      stopTossSpinSound();
      return;
    }

    if (!canPlaySound()) {
      unlockAudio();
      return;
    }

    playGameSound("tossSpin", { step: soundState.tossSpinStep });
    soundState.tossSpinStep += 1;
  };

  tick();
  soundState.tossSpinTimer = window.setInterval(tick, 190);
}

function toggleSound() {
  if (!soundState.supported) {
    return;
  }

  const shouldMute = !soundState.muted;
  setSoundMuted(shouldMute);

  if (shouldMute) {
    stopTossSpinSound();
  }

  if (!shouldMute) {
    playUiTap();
  }
}

function isDisabledSoundControl(control) {
  return (
    control.disabled ||
    control.getAttribute("aria-disabled") === "true" ||
    control.closest("[aria-disabled='true']")
  );
}

function handleUiSoundClick(event) {
  const control = event.target.closest("button, .custom-select-button, .custom-select-option");
  if (
    !control ||
    control.id === "soundToggle" ||
    control.id === "volumeDownButton" ||
    control.id === "volumeUpButton" ||
    control.closest(".cell") ||
    isDisabledSoundControl(control)
  ) {
    return;
  }

  playUiTap();
}

function initializeSoundControls() {
  soundState.muted = getSavedSoundMuted();
  soundState.volume = getSavedSoundVolume();
  updateSoundButton();

  const handleFirstGesture = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", handleFirstGesture, true);
    window.removeEventListener("keydown", handleFirstGesture, true);
  };

  window.addEventListener("pointerdown", handleFirstGesture, { capture: true, passive: true });
  window.addEventListener("keydown", handleFirstGesture, true);
  document.addEventListener("click", handleUiSoundClick);
  soundToggleButton?.addEventListener("click", toggleSound);
  volumeDownButton?.addEventListener("click", () => changeSoundVolume(-SOUND_VOLUME_STEP));
  volumeUpButton?.addEventListener("click", () => changeSoundVolume(SOUND_VOLUME_STEP));
}

function animateElement(element, keyframes, options) {
  if (!element?.animate) {
    return;
  }
  element.animate(keyframes, options);
}

function animateTurnChange() {
  animateElement(
    turnBanner,
    [
      { transform: "translateX(-50%) translateY(10px) scale(0.96)", opacity: 0.45 },
      { transform: "translateX(-50%) translateY(0) scale(1)", opacity: 1 },
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
      { transform: "scale(0.92)", opacity: 0.7 },
      { transform: "scale(1)", opacity: 1 },
    ],
    {
      duration: 240,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  );
}

function closeCustomSelects(exceptWrapper = null) {
  for (const control of customSelectControls.values()) {
    if (control.wrapper === exceptWrapper) {
      continue;
    }

    control.wrapper.classList.remove("is-open");
    control.wrapper.closest("label")?.classList.remove("select-open");
    control.button.setAttribute("aria-expanded", "false");
    control.menu.hidden = true;
  }
}

function refreshCustomSelect(select) {
  const control = customSelectControls.get(select);
  if (!control) {
    return;
  }

  const selectedOption = select.options[select.selectedIndex];
  control.value.textContent = selectedOption?.textContent ?? "";
  control.button.setAttribute("aria-disabled", String(select.disabled));
  control.button.tabIndex = select.disabled ? -1 : 0;
  control.wrapper.classList.toggle("is-disabled", select.disabled);

  for (const item of control.menu.querySelectorAll(".custom-select-option")) {
    const isSelected = item.dataset.value === select.value;
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-selected", String(isSelected));
  }

  if (select.disabled) {
    closeCustomSelects();
  }
}

function refreshCustomSelects() {
  for (const select of setupSelectElements) {
    refreshCustomSelect(select);
  }
}

function buildCustomSelect(select) {
  if (customSelectControls.has(select)) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add("native-select");
  select.hidden = true;
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;

  const button = document.createElement("div");
  button.className = "custom-select-button";
  button.tabIndex = 0;
  button.setAttribute("role", "button");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");

  const value = document.createElement("span");
  value.className = "custom-select-value";
  const arrow = document.createElement("span");
  arrow.className = "custom-select-arrow";
  arrow.setAttribute("aria-hidden", "true");
  button.append(value, arrow);

  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.id = `${select.id}Menu`;
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  button.setAttribute("aria-controls", menu.id);

  wrapper.append(button, menu);
  customSelectControls.set(select, { wrapper, button, value, menu });

  const rebuildOptions = () => {
    menu.innerHTML = "";
    for (const option of select.options) {
      const item = document.createElement("div");
      item.className = "custom-select-option";
      item.tabIndex = 0;
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.setAttribute("aria-disabled", String(option.disabled));
      item.setAttribute("role", "option");

      const chooseOption = ({ playFeedback = false } = {}) => {
        if (select.disabled || option.disabled || item.getAttribute("aria-disabled") === "true") {
          return;
        }

        if (playFeedback) {
          playUiTap();
        }

        select.value = option.value;
        closeCustomSelects();
        select.dispatchEvent(new Event("change", { bubbles: true }));
        refreshCustomSelects();
      };

      item.addEventListener("click", chooseOption);
      item.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        chooseOption({ playFeedback: true });
      });

      menu.appendChild(item);
    }

    refreshCustomSelect(select);
  };

  const toggleMenu = ({ playFeedback = false } = {}) => {
    if (select.disabled) {
      return;
    }

    if (playFeedback) {
      playUiTap();
    }

    const shouldOpen = !wrapper.classList.contains("is-open");
    closeCustomSelects(wrapper);
    wrapper.classList.toggle("is-open", shouldOpen);
    wrapper.closest("label")?.classList.toggle("select-open", shouldOpen);
    button.setAttribute("aria-expanded", String(shouldOpen));
    menu.hidden = !shouldOpen;

    if (shouldOpen) {
      animateControl(wrapper);
    }
  };

  button.addEventListener("click", toggleMenu);

  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleMenu({ playFeedback: true });
      return;
    }

    if (event.key !== "Escape") {
      return;
    }

    closeCustomSelects();
    button.focus();
  });

  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    closeCustomSelects();
    button.focus();
  });

  select.addEventListener("change", () => refreshCustomSelect(select));
  rebuildOptions();
}

function initializeCustomSelects() {
  for (const select of setupSelectElements) {
    buildCustomSelect(select);
  }

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".custom-select")) {
      closeCustomSelects();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.body.classList.contains("settings-open")) {
        event.preventDefault();
        closeSettings();
        return;
      }

      closeCustomSelects();
    }
  });
}

function openSettings() {
  if (!settingsPanel) {
    return;
  }

  closeCustomSelects();
  updateSoundButton();
  updateThemeButton(document.body.dataset.theme || DEFAULT_THEME);
  refreshUsernameControls();
  settingsPanel.hidden = false;
  document.body.classList.add("settings-open");
  settingsBackButton?.focus();
}

function closeSettings({ restoreFocus = true } = {}) {
  if (!settingsPanel) {
    return;
  }

  document.body.classList.remove("settings-open");
  settingsPanel.hidden = true;

  if (restoreFocus) {
    settingsButton?.focus();
  }
}

function closeIntro() {
  closeSettings({ restoreFocus: false });
  document.body.classList.remove("intro-open");
  document.body.classList.remove("setup-open");
  document.body.classList.remove("matchmaking-open");
  closeCustomSelects();
}

function openSetup() {
  document.body.classList.add("setup-open");
  setInputsFromState();
}

function openOptionsFromGame() {
  if (uiState.resolving) {
    return;
  }

  clearAiTimer();
  setInputsFromState();
  setModeControls();
  updateAiStatus();
  document.body.classList.add("intro-open", "setup-open");
}

function syncGameBackButton() {
  if (!gameBackButton) {
    return;
  }

  const label = uiState.game?.winner ? WIN_BACK_LABEL : HOLD_BACK_LABEL;
  gameBackButton.setAttribute("aria-label", label);
  gameBackButton.title = label;
}

function setHoldProgress(button, progress) {
  button.style.setProperty("--hold-angle", `${Math.round(progress * 360)}deg`);
}

function resetHoldProgress(button) {
  button.classList.remove("holding", "complete");
  setHoldProgress(button, 0);
}

function bindHoldToOptions(button) {
  if (!button) {
    return;
  }

  let holdFrame = null;
  let completed = false;

  const cancelHold = () => {
    if (completed) {
      return;
    }
    cancelAnimationFrame(holdFrame);
    holdFrame = null;
    resetHoldProgress(button);
  };

  const openWinnerMenu = (event) => {
    if (!uiState.game?.winner || document.body.classList.contains("intro-open")) {
      return false;
    }

    event?.preventDefault();
    cancelAnimationFrame(holdFrame);
    holdFrame = null;
    resetHoldProgress(button);
    openOptionsFromGame();
    return true;
  };

  button.addEventListener("pointerdown", (event) => {
    if (document.body.classList.contains("intro-open")) {
      return;
    }

    event.preventDefault();
    if (openWinnerMenu(event)) {
      return;
    }

    if (uiState.resolving) {
      return;
    }

    completed = false;
    cancelAnimationFrame(holdFrame);
    button.setPointerCapture?.(event.pointerId);
    button.classList.add("holding");

    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / HOLD_TO_OPTIONS_MS);
      setHoldProgress(button, progress);

      if (progress >= 1) {
        completed = true;
        cancelAnimationFrame(holdFrame);
        holdFrame = null;
        button.classList.remove("holding");
        button.classList.add("complete");
        openOptionsFromGame();
        window.setTimeout(() => {
          completed = false;
          resetHoldProgress(button);
        }, 180);
        return;
      }

      holdFrame = requestAnimationFrame(tick);
    };

    holdFrame = requestAnimationFrame(tick);
  });

  button.addEventListener("pointerup", cancelHold);
  button.addEventListener("pointercancel", cancelHold);
  button.addEventListener("lostpointercapture", cancelHold);
  button.addEventListener("click", openWinnerMenu);
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
  return !uiState.tossing && uiState.mode === "ai" && getCurrentPlayerId(uiState.game) === getAiPlayerId();
}

function clearAiTimer() {
  if (uiState.aiTurnTimer !== null) {
    clearTimeout(uiState.aiTurnTimer);
    uiState.aiTurnTimer = null;
  }
}

function chooseTossWinnerIndex(playerCount) {
  return Math.floor(Math.random() * Math.max(playerCount, 1));
}

function renderTossPlayers(winnerIndex) {
  if (!tossRing) {
    return;
  }

  tossRing.innerHTML = "";
  const players = uiState.game.players;
  const spread = 360 / Math.max(players.length, 1);

  for (const [index, player] of players.entries()) {
    const chip = document.createElement("span");
    chip.className = "toss-chip";
    chip.classList.toggle("is-winner", index === winnerIndex);
    chip.style.setProperty("--chip-accent", player.accent);
    chip.style.setProperty("--slot-angle", `${index * spread}deg`);
    chip.textContent = player.name.slice(0, 1);
    tossRing.appendChild(chip);
  }
}

function setTossOverlayVisible(isVisible) {
  if (!tossOverlay) {
    return;
  }

  tossOverlay.hidden = !isVisible;
  tossOverlay.setAttribute("aria-hidden", String(!isVisible));
  if (!isVisible) {
    tossOverlay.classList.remove("is-active", "is-revealed");
    tossRing?.classList.remove("is-spinning");
    tossCoin?.classList.remove("is-flipping");
    stopTossSpinSound();
  }
}

async function runStartToss() {
  if (!uiState.game) {
    return;
  }

  const winnerIndex = chooseTossWinnerIndex(uiState.game.players.length);
  const winner = uiState.game.players[winnerIndex];

  uiState.tossing = true;
  uiState.resolving = true;
  clearAiTimer();
  renderBoard();
  renderTossPlayers(winnerIndex);

  if (tossOverlay && tossCoin && tossCoinText && tossResult) {
    tossOverlay.style.setProperty("--toss-accent", winner.accent);
    tossCoinText.textContent = "?";
    tossResult.textContent = "Choosing first move";
    setTossOverlayVisible(true);
    void tossOverlay.offsetWidth;
    tossOverlay.classList.add("is-active");
    tossRing?.classList.add("is-spinning");
    tossCoin.classList.add("is-flipping");
    turnBanner.textContent = "Tossing";
    playGameSound("tossStart");
    startTossSpinSound(TOSS_SPIN_MS);
    await sleep(TOSS_SPIN_MS);
    stopTossSpinSound();
    tossCoin.classList.remove("is-flipping");
    tossRing?.classList.remove("is-spinning");
    tossCoinText.textContent = winner.name.slice(0, 1);
    tossResult.textContent = `${winner.name} starts`;
    tossOverlay.classList.add("is-revealed");
    playGameSound("tossReveal");
  }

  uiState.game.currentPlayerIndex = winnerIndex;
  renderBoard();

  if (tossOverlay) {
    await sleep(TOSS_REVEAL_MS);
    setTossOverlayVisible(false);
  }

  uiState.tossing = false;
  uiState.resolving = false;
  renderBoard();
  maybeScheduleAiTurn("AI is ready after the toss.");
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateBoardSizing() {
  if (!uiState.game || !boardShellElement) {
    return;
  }

  const rows = uiState.game.rows;
  const cols = uiState.game.cols;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 600;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 700;
  const shortSide = Math.min(viewportWidth, viewportHeight);
  const isShortScreen = viewportHeight <= 420;
  const gap = isShortScreen
    ? clampNumber(shortSide * 0.012, 2.5, 6)
    : clampNumber(shortSide * 0.014, 4, 10);
  const framePad = isShortScreen
    ? clampNumber(shortSide * 0.012, 5, 10)
    : clampNumber(shortSide * 0.016, 8, 18);
  const sideReserve = viewportWidth <= 560 ? 28 : viewportWidth <= 880 ? 36 : 64;
  const isNarrowScreen = viewportWidth <= 560;
  const topReserve = isShortScreen ? 62 : isNarrowScreen ? 104 : 84;
  const messageReserve = 0;
  const bottomReserve = isShortScreen ? 12 : isNarrowScreen ? 52 : viewportWidth <= 880 ? 28 : 36;
  const horizontalSpace = Math.max(160, viewportWidth - sideReserve - framePad * 2);
  const verticalSpace = Math.max(
    160,
    viewportHeight - topReserve - messageReserve - bottomReserve - framePad * 2,
  );
  const cellByWidth = (horizontalSpace - gap * (cols - 1)) / cols;
  const cellByHeight = (verticalSpace - gap * (rows - 1)) / rows;
  const minCellSize = isShortScreen ? 12 : 18;
  const cellSize = Math.floor(clampNumber(Math.min(cellByWidth, cellByHeight, 76), minCellSize, 76));

  boardShellElement.style.setProperty("--rows", String(rows));
  boardShellElement.style.setProperty("--cols", String(cols));
  boardShellElement.style.setProperty("--cell-size", `${cellSize}px`);
  boardShellElement.style.setProperty("--board-gap", `${gap.toFixed(2)}px`);
  boardShellElement.style.setProperty("--frame-pad", `${framePad.toFixed(2)}px`);
}

function isOnlineMode() {
  return uiState.mode === "online";
}

function sanitizeMatchId(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "")
    .slice(0, 16);
}

function getOnlinePlayer() {
  return onlineState.match?.players.find((player) => player.clientId === getClientId()) ?? null;
}

function getOnlinePlayerForColor(colorId) {
  return onlineState.match?.players.find((player) => player.colorId === colorId) ?? null;
}

function getOnlineSettingsPayload() {
  const preset = BOARD_PRESETS[presetSelect.value] ? presetSelect.value : INITIAL_PRESET;
  return {
    preset,
    playerCount: Math.max(2, Math.min(4, Number(playerCountSelect.value) || 2)),
  };
}

function setOnlineStatus(message, isError = false) {
  onlineState.status = message;
  if (onlineStatus) {
    onlineStatus.textContent = message;
    onlineStatus.classList.toggle("is-error", isError);
  }
}

function getQueueMessage(queue) {
  const playerCount = queue?.playerCount ?? Math.max(2, Math.min(4, Number(playerCountSelect.value) || 2));
  const joinedCount = queue?.joinedCount ?? queue?.players?.length ?? 0;
  if (joinedCount >= playerCount) {
    return "Match found";
  }
  if (joinedCount <= 1) {
    return `Waiting for players... ${joinedCount}/${playerCount} joined.`;
  }
  const remaining = playerCount - joinedCount;
  return `${joinedCount}/${playerCount} joined - waiting for ${remaining} more ${remaining === 1 ? "player" : "players"}.`;
}

function getMatchedPlayersText(players = []) {
  if (!players.length) {
    return "Matched players will appear here.";
  }
  return `Matched players: ${players.map((player) => player.displayName).join(", ")}`;
}

function renderOnlinePlayerList() {
  if (!onlinePlayerList) {
    return;
  }
  onlinePlayerList.innerHTML = "";

  const snapshot = onlineState.queue ?? onlineState.match;
  if (!snapshot) {
    const empty = document.createElement("div");
    empty.className = "online-player-row";
    empty.innerHTML = `<span class="online-player-dot"></span><span class="online-player-name">Press PLAY to search</span>`;
    onlinePlayerList.appendChild(empty);
    return;
  }

  for (let index = 0; index < snapshot.playerCount; index += 1) {
    const player = snapshot.players[index];
    const poolPlayer = PLAYER_POOL[index];
    const row = document.createElement("div");
    row.className = "online-player-row";
    row.style.setProperty("--player-accent", player?.accent ?? poolPlayer.accent);

    const dot = document.createElement("span");
    dot.className = "online-player-dot";

    const name = document.createElement("span");
    name.className = "online-player-name";
    name.textContent = player ? player.displayName : `${poolPlayer.name} slot open`;

    const meta = document.createElement("span");
    meta.className = "online-player-meta";
    if (player?.clientId === getClientId()) {
      const self = document.createElement("span");
      self.className = "online-pill self";
      self.textContent = "You";
      meta.appendChild(self);
    }
    const status = document.createElement("span");
    status.className = `online-pill${player && !player.connected ? " disconnected" : ""}`;
    status.textContent = player
      ? player.connected
        ? "Joined"
        : "Disconnected"
      : "Waiting";
    meta.appendChild(status);

    row.append(dot, name, meta);
    onlinePlayerList.appendChild(row);
  }
}

function renderOnlineLobby() {
  const isOnline = isOnlineMode();
  document.body.classList.toggle("online-mode", isOnline);
  document.body.classList.toggle("matchmaking-open", isOnline && onlineState.matchmaking);
  if (onlineLobby) {
    onlineLobby.hidden = !isOnline || !onlineState.matchmaking;
  }
  if (!isOnline || !onlineState.matchmaking) {
    return;
  }

  const queue = onlineState.queue;
  const playerCount = queue?.playerCount ?? Math.max(2, Math.min(4, Number(playerCountSelect.value) || 2));
  const joinedCount = queue?.joinedCount ?? queue?.players?.length ?? 0;

  if (onlineJoinedCount) {
    const countValue = onlineJoinedCount.querySelector("strong");
    if (countValue) {
      countValue.textContent = `${joinedCount}/${playerCount}`;
    }
  }

  if (onlineMatchSummary) {
    onlineMatchSummary.textContent = getMatchedPlayersText(queue?.players ?? []);
  }

  renderOnlinePlayerList();
  if (!onlineStatus?.classList.contains("is-error")) {
    setOnlineStatus(queue?.message ?? getQueueMessage(queue));
  }
}

function getSavedOnlineMatchId() {
  try {
    return sanitizeMatchId(localStorage.getItem(ONLINE_MATCH_STORAGE_KEY));
  } catch {
    return "";
  }
}

function saveOnlineMatchId(matchId) {
  const id = sanitizeMatchId(matchId);
  try {
    if (id) {
      localStorage.setItem(ONLINE_MATCH_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(ONLINE_MATCH_STORAGE_KEY);
    }
  } catch {
    // Match-id persistence is a convenience only.
  }
}

function getOnlineDisplayNameForColor(colorId) {
  const onlinePlayer = getOnlinePlayerForColor(colorId);
  if (onlinePlayer?.displayName) {
    return onlinePlayer.displayName;
  }
  return uiState.game?.players.find((player) => player.id === colorId)?.name ?? "Player";
}

function syncOnlineSetupInputs(snapshot) {
  if (!snapshot?.settings) {
    return;
  }
  if (BOARD_PRESETS[snapshot.settings.preset]) {
    presetSelect.value = snapshot.settings.preset;
  }
  playerCountSelect.value = String(snapshot.playerCount ?? snapshot.settings.playerCount ?? 2);
  refreshCustomSelects();
}

function applyOnlineQueue(queue) {
  if (!queue) {
    return;
  }

  onlineState.queue = queue;
  onlineState.matchmaking = true;
  syncOnlineSetupInputs(queue);
  renderOnlineLobby();
}

function applyOnlineMatch(match, { syncGame = true } = {}) {
  if (!match) {
    return;
  }

  onlineState.match = match;
  onlineState.matchId = match.id;
  onlineState.queue = null;
  onlineState.matchmaking = false;
  saveOnlineMatchId(match.id);
  syncOnlineSetupInputs(match);

  if (match.state && syncGame && !uiState.resolving && !uiState.tossing) {
    clearAiTimer();
    uiState.game = cloneGameState(match.state);
    uiState.history = [];
    uiState.mode = "online";
    renderBoard();
  }

  renderOnlineLobby();
}

function loadSocketClient() {
  if (window.io) {
    return Promise.resolve(window.io);
  }
  if (onlineState.socketClientPromise) {
    return onlineState.socketClientPromise;
  }

  onlineState.socketClientPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = ONLINE_SOCKET_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.io) {
        resolve(window.io);
        return;
      }
      onlineState.socketClientPromise = null;
      reject(new Error("Socket.IO unavailable."));
    };
    script.onerror = () => {
      onlineState.socketClientPromise = null;
      reject(new Error("Online server unavailable."));
    };
    document.head.appendChild(script);
  });

  return onlineState.socketClientPromise;
}

async function getOnlineSocket() {
  if (onlineState.socket?.connected) {
    return onlineState.socket;
  }

  const ioClient = await loadSocketClient();
  if (!onlineState.socket) {
    onlineState.socket = ioClient({
      reconnection: true,
      timeout: 5000,
    });

    onlineState.socket.on("connect", () => {
      if (isOnlineMode() && onlineState.matchId) {
        setOnlineStatus("Reconnecting...");
        reconnectOnlineMatch();
      }
    });
    onlineState.socket.on("disconnect", () => {
      if (isOnlineMode()) {
        setOnlineStatus("Disconnected from server", true);
        renderOnlineLobby();
      }
    });
    onlineState.socket.on("online:queueUpdate", ({ queue } = {}) => {
      applyOnlineQueue(queue);
    });
    onlineState.socket.on("online:matchUpdate", handleOnlineMatchUpdate);
    onlineState.socket.on("online:matchStarted", handleOnlineMatchStarted);
    onlineState.socket.on("online:moveApplied", handleOnlineMoveApplied);
    onlineState.socket.on("online:matchmakingCancelled", () => {
      setOnlineStatus("Matchmaking cancelled.");
    });
  }

  if (!onlineState.socket.connected) {
    onlineState.socket.connect();
  }
  return onlineState.socket;
}

function emitOnline(eventName, payload) {
  return new Promise(async (resolve) => {
    try {
      const socket = await getOnlineSocket();
      socket.timeout(6000).emit(eventName, payload, (error, response) => {
        if (error) {
          resolve({ ok: false, error: "Online server did not respond." });
          return;
        }
        resolve(response ?? { ok: true });
      });
    } catch {
      resolve({ ok: false, error: "Online server unavailable. Start the server and open the game from it." });
    }
  });
}

function getOnlineIdentityPayload() {
  return {
    clientId: getClientId(),
    username: getSavedUsername(),
  };
}

async function updateOnlineProfileInMatchmaking() {
  if (!onlineState.queue && !onlineState.match) {
    return;
  }

  const result = await emitOnline("online:updateProfile", getOnlineIdentityPayload());
  if (result.ok) {
    if (result.queue) {
      applyOnlineQueue(result.queue);
    }
    if (result.match) {
      applyOnlineMatch(result.match, { syncGame: false });
    }
    return;
  }
  setOnlineStatus(result.error ?? "Could not update online profile.", true);
}

async function reconnectOnlineMatch() {
  const matchId = onlineState.matchId || getSavedOnlineMatchId();
  if (!matchId || onlineState.reconnecting) {
    return;
  }

  onlineState.reconnecting = true;
  const result = await emitOnline("online:reconnectMatch", {
    ...getOnlineIdentityPayload(),
    matchId,
  });
  onlineState.reconnecting = false;
  if (!result.ok) {
    setOnlineStatus(result.error ?? "Reconnect unavailable.", true);
    return;
  }

  applyOnlineMatch(result.match);
  if (result.match?.state) {
    closeIntro();
  }
  setOnlineStatus("Reconnected.");
}

async function handleStartMatchmaking() {
  if (!isOnlineMode()) {
    modeSelect.value = "online";
    handleModeChange();
  }

  clearAiTimer();
  closeCustomSelects();
  onlineState.queue = null;
  onlineState.match = null;
  onlineState.matchId = "";
  onlineState.matchmaking = true;
  onlineState.moving = false;
  saveOnlineMatchId("");
  setModeControls();
  setOnlineStatus("Searching for players...");
  renderOnlineLobby();

  const result = await emitOnline("online:joinQueue", {
    ...getOnlineIdentityPayload(),
    settings: getOnlineSettingsPayload(),
  });

  if (!result.ok) {
    setOnlineStatus(result.error ?? "Could not start matchmaking.", true);
    return;
  }

  if (result.queue) {
    applyOnlineQueue(result.queue);
  }
  if (result.started?.match) {
    setOnlineStatus("Match found.");
  }
}

async function handleCancelMatchmaking() {
  if (!onlineState.matchmaking) {
    return;
  }

  await emitOnline("online:cancelQueue", {
    ...getOnlineIdentityPayload(),
  });
  onlineState.matchmaking = false;
  onlineState.queue = null;
  setOnlineStatus("Matchmaking cancelled.");
  renderOnlineLobby();
  applyButton?.focus();
}

async function playOnlineToss(tossWinnerIndex) {
  if (!uiState.game) {
    return;
  }

  const winner = uiState.game.players[tossWinnerIndex] ?? getCurrentPlayer(uiState.game);
  const winnerName = getOnlineDisplayNameForColor(winner.id);

  uiState.tossing = true;
  uiState.resolving = true;
  clearAiTimer();
  renderBoard();
  renderTossPlayers(tossWinnerIndex);

  if (tossOverlay && tossCoin && tossCoinText && tossResult) {
    tossOverlay.style.setProperty("--toss-accent", winner.accent);
    tossCoinText.textContent = "?";
    tossResult.textContent = "Choosing first move";
    setTossOverlayVisible(true);
    void tossOverlay.offsetWidth;
    tossOverlay.classList.add("is-active");
    tossRing?.classList.add("is-spinning");
    tossCoin.classList.add("is-flipping");
    turnBanner.textContent = "Tossing";
    playGameSound("tossStart");
    startTossSpinSound(TOSS_SPIN_MS);
    await sleep(TOSS_SPIN_MS);
    stopTossSpinSound();
    tossCoin.classList.remove("is-flipping");
    tossRing?.classList.remove("is-spinning");
    tossCoinText.textContent = winner.name.slice(0, 1);
    tossResult.textContent = `${winnerName} starts`;
    tossOverlay.classList.add("is-revealed");
    playGameSound("tossReveal");
  }

  uiState.game.currentPlayerIndex = tossWinnerIndex;
  renderBoard();

  if (tossOverlay) {
    await sleep(TOSS_REVEAL_MS);
    setTossOverlayVisible(false);
  }

  uiState.tossing = false;
  uiState.resolving = false;
  renderBoard();
}

async function handleOnlineMatchStarted(payload) {
  if (!payload?.match || !payload.state) {
    return;
  }

  clearAiTimer();
  onlineState.moving = false;
  applyOnlineMatch(payload.match, { syncGame: false });
  uiState.mode = "online";
  uiState.game = cloneGameState(payload.state);
  uiState.history = [];
  lastVisualTurn = null;
  closeIntro();
  document.body.classList.remove("matchmaking-open");
  setOnlineStatus("Match started.");
  await playOnlineToss(payload.tossWinnerIndex ?? uiState.game.currentPlayerIndex);
}

function handleOnlineMatchUpdate(payload) {
  if (!payload?.match) {
    return;
  }
  applyOnlineMatch(payload.match, {
    syncGame: !uiState.resolving && !uiState.tossing && !onlineState.moving,
  });
}

async function handleOnlineMoveApplied(payload) {
  if (!payload?.match || !payload.state) {
    return;
  }

  onlineState.moving = false;
  applyOnlineMatch(payload.match, { syncGame: false });
  clearAiTimer();
  uiState.mode = "online";
  if (!uiState.game) {
    uiState.game = cloneGameState(payload.state);
  }
  uiState.resolving = true;
  renderBoard();
  playGameSound("placement");

  for (const [index, frame] of (payload.frames ?? []).entries()) {
    const delay = index === 0 ? 180 : ANIMATION_STEP_MS;
    await playFrame(frame, delay);
  }

  uiState.game = cloneGameState(payload.state);
  uiState.resolving = false;
  renderBoard();

  if (uiState.game.winner) {
    const winnerName = getOnlineDisplayNameForColor(uiState.game.winner);
    updateStatus(`${winnerName} dominates the entire board.`);
    playGameSound("win");
    return;
  }

  const currentPlayer = getCurrentPlayer(uiState.game);
  const currentName = getOnlineDisplayNameForColor(currentPlayer.id);
  updateStatus(
    getOnlinePlayerForColor(currentPlayer.id)?.clientId === getClientId()
      ? "Your turn."
      : `Waiting for ${currentName}.`,
  );
}

async function sendOnlineMove(action) {
  if (onlineState.moving || uiState.resolving || uiState.tossing || !onlineState.match) {
    return;
  }

  const player = getOnlinePlayer();
  if (!player) {
    setOnlineStatus("You are not in this match.", true);
    return;
  }
  if (player.colorId !== getCurrentPlayerId(uiState.game)) {
    setOnlineStatus("Not your turn.", true);
    return;
  }
  if (!canPlayAction(uiState.game, action, player.colorId)) {
    setOnlineStatus("Illegal move.", true);
    return;
  }

  onlineState.moving = true;
  uiState.resolving = true;
  renderBoard();
  const result = await emitOnline("online:move", {
    ...getOnlineIdentityPayload(),
    matchId: onlineState.match.id,
    action,
  });

  if (!result.ok) {
    onlineState.moving = false;
    uiState.resolving = false;
    setOnlineStatus(result.error ?? "Move rejected.", true);
    renderBoard();
  }
}

function setInputsFromState() {
  playerCountSelect.value = String(uiState.game.players.length);
  modeSelect.value = uiState.mode;
  aiSeatSelect.value = uiState.aiSeat;
  aiDifficultySelect.value = uiState.aiDifficulty;

  const matchedPreset = Object.entries(BOARD_PRESETS).find(
    ([, preset]) => preset.rows === uiState.game.rows && preset.cols === uiState.game.cols,
  );
  presetSelect.value = matchedPreset ? matchedPreset[0] : INITIAL_PRESET;
  refreshCustomSelects();
}

function setModeControls() {
  const isAiMode = uiState.mode === "ai";
  const isOnline = isOnlineMode();
  const isLocked = uiState.resolving || onlineState.matchmaking;
  aiSeatSelect.disabled = !isAiMode || isLocked;
  aiDifficultySelect.disabled = !isAiMode || isLocked || isOnline;
  playerCountSelect.disabled = isAiMode || isLocked;
  if (isAiMode) {
    playerCountSelect.value = "2";
  }
  refreshCustomSelects();
  renderOnlineLobby();
}

function updateAiStatus(extra = "") {
  aiStatusElement.textContent = "";
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
  if (uiState.resolving || uiState.tossing || uiState.game.winner || isAiTurn()) {
    return false;
  }

  let playerId = getCurrentPlayerId(uiState.game);
  if (isOnlineMode()) {
    const player = getOnlinePlayer();
    if (
      !player ||
      onlineState.moving ||
      onlineState.match?.status !== "playing" ||
      player.colorId !== playerId
    ) {
      return false;
    }
    playerId = player.colorId;
  }

  const legalActions = getLegalActions(uiState.game, playerId);
  return legalActions.some((action) => action.row === cell.row && action.col === cell.col);
}

function renderBoard(highlights = []) {
  const highlightSet = new Set(highlights.map(({ row, col }) => `${row},${col}`));
  updateBoardSizing();
  boardElement.style.gridTemplateColumns = `repeat(${uiState.game.cols}, var(--cell-size, 64px))`;
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
  if (isOnlineMode() && onlineState.match) {
    if (uiState.game.winner) {
      turnBanner.textContent = `${getOnlineDisplayNameForColor(uiState.game.winner)} wins`;
    } else {
      const currentOnlinePlayer = getOnlinePlayerForColor(currentPlayer.id);
      turnBanner.textContent =
        currentOnlinePlayer?.connected === false
          ? `${currentOnlinePlayer.displayName ?? currentPlayer.name} disconnected`
          : currentOnlinePlayer?.clientId === getClientId()
          ? "Your turn"
          : `Waiting for ${currentOnlinePlayer?.displayName ?? currentPlayer.name}`;
    }
  } else {
    turnBanner.textContent = uiState.game.winner
      ? `${uiState.game.players.find((player) => player.id === uiState.game.winner).name} wins`
      : `${currentPlayer.name} to move`;
  }
  syncGameBackButton();

  if (lastVisualTurn !== visualTurn) {
    if (lastVisualTurn !== null && !uiState.resolving && !uiState.tossing && !uiState.game.winner) {
      playGameSound("turn");
    }
    animateTurnChange();
    lastVisualTurn = visualTurn;
  }

  const canUndo = uiState.history.length > 0 && !uiState.resolving;
  if (undoButton && undoButton.disabled === canUndo) {
    animateControl(undoButton);
  }
  if (undoButton) {
    undoButton.disabled = !canUndo;
  }
  if (gameBackButton) {
    gameBackButton.disabled = uiState.resolving;
  }
  setModeControls();
}

function updateStatus(message) {
  uiState.lastMessage = message;
  messageElement.textContent = "";
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

    const animation = particle.animate(
      [
        {
          transform: "translate(-50%, -50%) translate(0px, 0px) scale(0.45)",
          opacity: 0,
        },
        {
          transform: `translate(-50%, -50%) translate(${(to.x - from.x) * 0.62}px, ${(to.y - from.y) * 0.62}px) scale(1.14)`,
          opacity: 1,
          offset: 0.6,
        },
        {
          transform: `translate(-50%, -50%) translate(${to.x - from.x}px, ${to.y - from.y}px) scale(0.96)`,
          opacity: 0.1,
        },
      ],
      {
        duration: 430,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
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
  if (frame.transfers?.length) {
    playGameSound("chainPop", { intensity: frame.transfers.length });
  }
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
  scheduleAi = true,
} = {}) {
  clearAiTimer();
  uiState.game = createMatchState({ rows, cols, playerCount });
  uiState.history = [];
  uiState.resolving = false;
  uiState.tossing = false;
  lastVisualTurn = null;
  setInputsFromState();
  renderBoard();
  updateStatus("Each player may claim any empty cell on their first turn, then may play only on their own cells.");
  if (scheduleAi) {
    maybeScheduleAiTurn("AI preparing opening book.");
  }
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
  playGameSound("placement");

  const simulation = simulateAction(uiState.game, action, currentPlayer.id);
  for (const [index, frame] of simulation.frames.entries()) {
    const delay = index === 0 ? 180 : ANIMATION_STEP_MS;
    await playFrame(frame, delay);
  }

  uiState.game = simulation.state;
  uiState.resolving = false;
  renderBoard();

  if (uiState.game.winner) {
    updateStatus(`${currentPlayer.name} dominates the entire board.`);
    playGameSound("win");
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

  const action = { row: Number(button.dataset.row), col: Number(button.dataset.col) };
  if (isOnlineMode()) {
    sendOnlineMove(action);
    return;
  }

  commitMove(
    action,
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
  if (!BOARD_PRESETS[presetSelect.value]) {
    presetSelect.value = INITIAL_PRESET;
  }
  refreshCustomSelects();
}

async function handleNewMatch() {
  if (uiState.resolving) {
    return;
  }

  uiState.mode = modeSelect.value;
  uiState.aiSeat = aiSeatSelect.value;
  uiState.aiDifficulty = aiDifficultySelect.value;

  if (uiState.mode === "online") {
    await handleStartMatchmaking();
    return;
  }

  const preset = BOARD_PRESETS[presetSelect.value] ?? BOARD_PRESETS[INITIAL_PRESET];
  const rows = preset.rows;
  const cols = preset.cols;
  const playerCount = uiState.mode === "ai"
    ? 2
    : Math.max(2, Math.min(4, Number(playerCountSelect.value) || 2));

  resetGame({ rows, cols, playerCount, scheduleAi: false });
  closeIntro();
  await runStartToss();
}

function handleModeChange() {
  uiState.mode = modeSelect.value;
  if (uiState.mode === "ai") {
    playerCountSelect.value = "2";
    presetSelect.value = "5x5";
  }
  if (uiState.mode === "online") {
    const savedMatchId = onlineState.matchId || getSavedOnlineMatchId();
    if (savedMatchId && !onlineState.match && !onlineState.matchmaking) {
      onlineState.matchId = savedMatchId;
      reconnectOnlineMatch();
    }
  } else if (onlineState.matchmaking) {
    handleCancelMatchmaking();
  }
  setModeControls();
  updateAiStatus();
  refreshCustomSelects();
}

function handlePlayerCountChange() {
  const playerCount = Number(playerCountSelect.value) || 2;

  if (playerCount === 2) {
    presetSelect.value = "5x5";
    refreshCustomSelects();
    return;
  }

  if (uiState.mode !== "ai" && playerCount > 2) {
    presetSelect.value = "7x7";
  }
  refreshCustomSelects();
}

function handleAiConfigChange() {
  uiState.aiSeat = aiSeatSelect.value;
  uiState.aiDifficulty = aiDifficultySelect.value;
  updateAiStatus();
  refreshCustomSelects();
}

function initializeApp() {
  applyTheme(getSavedTheme(), { persist: false });
  initializeSoundControls();

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

  initializeCustomSelects();
  boardElement.addEventListener("click", handleBoardClick);
  undoButton?.addEventListener("click", handleUndo);
  bindHoldToOptions(gameBackButton);
  restartButton?.addEventListener("click", async () => {
    if (document.body.classList.contains("setup-open")) {
      handleNewMatch();
      return;
    }

    if (isOnlineMode()) {
      openOptionsFromGame();
      setOnlineStatus("Press PLAY to search for a new online match.");
      return;
    }

    resetGame({
      rows: uiState.game.rows,
      cols: uiState.game.cols,
      playerCount: uiState.game.players.length,
      scheduleAi: false,
    });
    await runStartToss();
  });
  applyButton.addEventListener("click", handleNewMatch);
  presetSelect.addEventListener("change", applyPreset);
  modeSelect.addEventListener("change", handleModeChange);
  playerCountSelect.addEventListener("change", handlePlayerCountChange);
  aiSeatSelect.addEventListener("change", handleAiConfigChange);
  aiDifficultySelect.addEventListener("change", handleAiConfigChange);
  playButton?.addEventListener("click", openSetup);
  backButton?.addEventListener("click", () => {
    if (onlineState.matchmaking) {
      handleCancelMatchmaking();
    }
    document.body.classList.remove("setup-open");
  });
  settingsButton?.addEventListener("click", openSettings);
  settingsBackButton?.addEventListener("click", () => closeSettings());
  themeToggleButton?.addEventListener("click", toggleTheme);
  usernameSaveButton?.addEventListener("click", saveUsername);
  usernameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveUsername();
    }
  });
  onlineCancelButton?.addEventListener("click", handleCancelMatchmaking);
  window.addEventListener("resize", updateBoardSizing);
  window.addEventListener("orientationchange", () => {
    window.setTimeout(updateBoardSizing, 150);
  });
  window.visualViewport?.addEventListener("resize", updateBoardSizing);

  getClientId();
  onlineState.matchId = getSavedOnlineMatchId();
  refreshUsernameControls();

  resetGame({
    rows: BOARD_PRESETS[INITIAL_PRESET].rows,
    cols: BOARD_PRESETS[INITIAL_PRESET].cols,
    playerCount: 2,
  });
}

initializeApp();
