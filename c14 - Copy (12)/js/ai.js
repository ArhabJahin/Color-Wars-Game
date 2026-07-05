import {
  cloneGameState,
  countOwnedCells,
  countOwnedDots,
  encodeState,
  getActionMask,
  getCurrentPlayerId,
  getLegalActions,
  getNeighbors,
  simulateAction,
} from "./engine.js";

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

export function evaluateState(state, playerId, playerModel = null, difficulty = "medium") {
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

export function extractMoveFeatures(state, action, playerId) {
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

export function chooseAiAction(state, difficulty = "medium", playerModel = null) {
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

export function createTrainingScaffolding() {
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