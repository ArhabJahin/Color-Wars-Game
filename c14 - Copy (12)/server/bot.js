const { getLegalActions, simulateAction } = require("./validation");

function scoreAction(state, action, playerId) {
  const cell = state.board[action.row]?.[action.col];
  const simulation = simulateAction(state, action, playerId);
  const chainScore = Math.max(0, simulation.frames.length - 1) * 100;
  const ownerScore = cell?.owner === playerId ? 20 : 0;
  const dotScore = Number(cell?.count) || 0;
  const centerRow = (state.rows - 1) / 2;
  const centerCol = (state.cols - 1) / 2;
  const centerDistance = Math.abs(action.row - centerRow) + Math.abs(action.col - centerCol);
  const centerScore = Math.max(0, 8 - centerDistance);

  return chainScore + ownerScore + dotScore * 10 + centerScore;
}

function chooseBotAction(state, playerId) {
  const actions = getLegalActions(state, playerId);
  if (!actions.length) {
    return null;
  }

  let bestScore = -Infinity;
  let bestActions = [];
  for (const action of actions) {
    const score = scoreAction(state, action, playerId);
    if (score > bestScore) {
      bestScore = score;
      bestActions = [action];
    } else if (score === bestScore) {
      bestActions.push(action);
    }
  }

  return bestActions[Math.floor(Math.random() * bestActions.length)];
}

module.exports = {
  chooseBotAction,
};
