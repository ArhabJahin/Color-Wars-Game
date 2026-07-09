const PLAYER_POOL = [
  { id: "red", name: "Red", accent: "#ff6a70" },
  { id: "blue", name: "Blue", accent: "#17b6eb" },
  { id: "green", name: "Green", accent: "#1f9d55" },
  { id: "amber", name: "Amber", accent: "#e2871f" },
];

const BOARD_PRESETS = {
  "5x5": { rows: 5, cols: 5 },
  "6x8": { rows: 6, cols: 8 },
  "9x6": { rows: 9, cols: 6 },
};

const INITIAL_PRESET = "5x5";
const ANIMATION_STEP_MS = 240;

const boardElement = document.getElementById("board");
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

const state = {
  rows: BOARD_PRESETS[INITIAL_PRESET].rows,
  cols: BOARD_PRESETS[INITIAL_PRESET].cols,
  board: [],
  players: PLAYER_POOL.slice(0, 2),
  currentPlayerIndex: 0,
  moveCounts: {},
  eliminated: {},
  winner: null,
  resolving: false,
  history: [],
};

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

function getCapacity(row, col, rows, cols) {
  let neighbors = 0;
  if (row > 0) neighbors += 1;
  if (row < rows - 1) neighbors += 1;
  if (col > 0) neighbors += 1;
  if (col < cols - 1) neighbors += 1;
  return neighbors;
}

function deepCopyBoard(board) {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

function getCurrentPlayer() {
  return state.players[state.currentPlayerIndex];
}

function getNeighbors(row, col) {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ].filter(({ row: nextRow, col: nextCol }) =>
    nextRow >= 0 &&
    nextRow < state.rows &&
    nextCol >= 0 &&
    nextCol < state.cols,
  );
}

function setPlayers(count) {
  state.players = PLAYER_POOL.slice(0, count);
  state.moveCounts = Object.fromEntries(state.players.map((player) => [player.id, 0]));
  state.eliminated = Object.fromEntries(state.players.map((player) => [player.id, false]));
}

function pushHistory() {
  state.history.push({
    rows: state.rows,
    cols: state.cols,
    board: deepCopyBoard(state.board),
    players: state.players.map((player) => ({ ...player })),
    currentPlayerIndex: state.currentPlayerIndex,
    moveCounts: { ...state.moveCounts },
    eliminated: { ...state.eliminated },
    winner: state.winner,
  });

  if (state.history.length > 60) {
    state.history.shift();
  }
}

function countOwnedCells() {
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

function countOwnedDots() {
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

function haveAllPlayersStarted() {
  return state.players.every((player) => state.moveCounts[player.id] > 0);
}

function refreshEliminations() {
  const ownedCells = countOwnedCells();
  const allStarted = haveAllPlayersStarted();

  for (const player of state.players) {
    state.eliminated[player.id] = allStarted && state.moveCounts[player.id] > 0 && ownedCells[player.id] === 0;
  }
}

function getActivePlayers() {
  return state.players.filter((player) => !state.eliminated[player.id]);
}

function evaluateWinner() {
  refreshEliminations();
  const alive = getActivePlayers();
  if (alive.length === 1 && haveAllPlayersStarted()) {
    return alive[0].id;
  }
  return null;
}

function setInputsFromState() {
  rowsInput.value = String(state.rows);
  colsInput.value = String(state.cols);
  playerCountSelect.value = String(state.players.length);
  const matchedPreset = Object.entries(BOARD_PRESETS).find(
    ([, preset]) => preset.rows === state.rows && preset.cols === state.cols,
  );
  presetSelect.value = matchedPreset ? matchedPreset[0] : "custom";
}

function resetGame({ rows = state.rows, cols = state.cols, playerCount = state.players.length } = {}) {
  state.rows = rows;
  state.cols = cols;
  setPlayers(playerCount);
  state.board = createBoard(rows, cols);
  state.currentPlayerIndex = 0;
  state.winner = null;
  state.resolving = false;
  state.history = [];
  setInputsFromState();
  renderBoard();
  updateStatus("Select an empty cell or one already owned by your color.");
}

function renderLegend() {
  const ownedDots = countOwnedDots();
  legendElement.innerHTML = "";

  for (const [index, player] of state.players.entries()) {
    const card = playerCardTemplate.content.firstElementChild.cloneNode(true);
    const score = card.querySelector(".player-score");
    const isCurrent = !state.winner && index === state.currentPlayerIndex;
    const isEliminated = state.eliminated[player.id];

    card.classList.add(`pos-${index}`);
    card.classList.toggle("active", isCurrent);
    card.classList.toggle("eliminated", isEliminated);
    card.style.setProperty("--accent", player.accent);
    card.setAttribute("aria-label", `${player.name} has ${ownedDots[player.id]} dots`);
    score.textContent = String(ownedDots[player.id]);
    legendElement.appendChild(card);
  }
}

function renderBoard(highlights = []) {
  const highlightSet = new Set(highlights.map(({ row, col }) => `${row},${col}`));
  boardElement.style.gridTemplateColumns = `repeat(${state.cols}, minmax(0, 1fr))`;
  boardElement.innerHTML = "";

  const currentPlayer = getCurrentPlayer();

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      const cell = state.board[row][col];
      const button = cellTemplate.content.firstElementChild.cloneNode(true);
      const dotsContainer = button.querySelector(".dots");
      const capacityElement = button.querySelector(".cell-capacity");
      const owner = cell.owner ? state.players.find((player) => player.id === cell.owner) : null;
      const blocked = cell.owner !== null && cell.owner !== currentPlayer.id;

      button.dataset.row = String(row);
      button.dataset.col = String(col);
      button.disabled = state.resolving || state.winner !== null;
      button.classList.add(owner ? owner.id : "empty");
      button.classList.toggle("blocked", !state.resolving && !state.winner && blocked);
      button.classList.toggle("just-updated", highlightSet.has(`${row},${col}`));
      button.classList.toggle("overloaded", cell.count >= cell.capacity && cell.count > 0);
      button.setAttribute(
        "aria-label",
        `${row + 1},${col + 1} ${owner ? owner.name : "empty"} ${cell.count}/${cell.capacity}`,
      );
      capacityElement.textContent = `${cell.capacity}`;

      for (let i = 0; i < cell.count; i += 1) {
        const dot = document.createElement("span");
        dot.className = `dot ${owner ? owner.id : "empty"} count-${Math.min(cell.count, 4)}`;
        dotsContainer.appendChild(dot);
      }

      boardElement.appendChild(button);
    }
  }

  renderLegend();
  syncStatus();
}

function syncStatus() {
  const currentPlayer = getCurrentPlayer();
  document.body.dataset.turn = state.winner ?? currentPlayer.id;
  turnBanner.textContent = state.winner
    ? `${state.players.find((player) => player.id === state.winner).name} wins`
    : `${currentPlayer.name} to move`;
  undoButton.disabled = state.history.length === 0 || state.resolving;
}

function updateStatus(message) {
  messageElement.textContent = message;
  syncStatus();
}

function canPlayCell(cell) {
  const currentPlayer = getCurrentPlayer();
  return !state.winner && !state.resolving && (cell.owner === null || cell.owner === currentPlayer.id);
}

function collectExplosions(board) {
  const overloaded = [];
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      const cell = board[row][col];
      if (cell.count >= cell.capacity && cell.capacity > 0) {
        overloaded.push({
          row,
          col,
          ownerId: cell.owner,
        });
      }
    }
  }
  return overloaded;
}

function simulateChain(startRow, startCol, player) {
  const workingBoard = deepCopyBoard(state.board);
  const frames = [];

  workingBoard[startRow][startCol].count += 1;
  workingBoard[startRow][startCol].owner = player.id;
  frames.push({
    board: deepCopyBoard(workingBoard),
    highlights: [{ row: startRow, col: startCol }],
    message: `${player.name} charges ${startRow + 1},${startCol + 1}.`,
  });

  while (true) {
    const explosions = collectExplosions(workingBoard);
    if (explosions.length === 0) {
      break;
    }

    const highlights = [];

    for (const { row, col, ownerId } of explosions) {
      const cell = workingBoard[row][col];
      const explosionOwnerId = ownerId ?? player.id;

      cell.count = 0;
      cell.owner = null;
      highlights.push({ row, col });

      for (const neighbor of getNeighbors(row, col)) {
        const nextCell = workingBoard[neighbor.row][neighbor.col];
        nextCell.count += 1;
        nextCell.owner = explosionOwnerId;
        highlights.push(neighbor);
      }
    }

    frames.push({
      board: deepCopyBoard(workingBoard),
      highlights,
      message: `${player.name} sets off a chain reaction.`,
    });
  }

  return { board: workingBoard, frames };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getNextActivePlayerIndex(fromIndex) {
  for (let step = 1; step <= state.players.length; step += 1) {
    const candidateIndex = (fromIndex + step) % state.players.length;
    const candidate = state.players[candidateIndex];
    if (!state.eliminated[candidate.id]) {
      return candidateIndex;
    }
  }
  return fromIndex;
}

async function handleMove(row, col) {
  const cell = state.board[row][col];
  if (!canPlayCell(cell)) {
    updateStatus("You can only place dots in an empty cell or one already controlled by you.");
    return;
  }

  pushHistory();
  state.resolving = true;
  renderBoard();

  const player = getCurrentPlayer();
  const { board, frames } = simulateChain(row, col, player);

  for (const frame of frames) {
    state.board = deepCopyBoard(frame.board);
    renderBoard(frame.highlights);
    updateStatus(frame.message);
    await sleep(ANIMATION_STEP_MS);
  }

  state.board = board;
  state.moveCounts[player.id] += 1;
  state.winner = evaluateWinner();

  if (state.winner) {
    state.resolving = false;
    renderBoard();
    updateStatus(`${player.name} dominates the entire board.`);
    return;
  }

  state.currentPlayerIndex = getNextActivePlayerIndex(state.currentPlayerIndex);
  state.resolving = false;
  renderBoard();
  updateStatus(`Board stabilized. ${getCurrentPlayer().name} is up next.`);
}

function handleBoardClick(event) {
  const button = event.target.closest(".cell");
  if (!button) {
    return;
  }

  handleMove(Number(button.dataset.row), Number(button.dataset.col));
}

function handleUndo() {
  if (state.history.length === 0 || state.resolving) {
    return;
  }

  const previous = state.history.pop();
  state.rows = previous.rows;
  state.cols = previous.cols;
  state.board = deepCopyBoard(previous.board);
  state.players = previous.players.map((player) => ({ ...player }));
  state.currentPlayerIndex = previous.currentPlayerIndex;
  state.moveCounts = { ...previous.moveCounts };
  state.eliminated = { ...previous.eliminated };
  state.winner = previous.winner;
  state.resolving = false;
  setInputsFromState();
  renderBoard();
  updateStatus("Previous turn restored.");
}

function clampSize(value) {
  return Math.max(3, Math.min(12, Number(value) || 0));
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
  if (state.resolving) {
    return;
  }

  const rows = clampSize(rowsInput.value);
  const cols = clampSize(colsInput.value);
  const playerCount = Math.max(2, Math.min(4, Number(playerCountSelect.value) || 2));

  rowsInput.value = String(rows);
  colsInput.value = String(cols);
  resetGame({ rows, cols, playerCount });
  updateStatus(`New ${rows} x ${cols} match started for ${playerCount} players.`);
}

boardElement.addEventListener("click", handleBoardClick);
undoButton.addEventListener("click", handleUndo);
restartButton.addEventListener("click", () => resetGame({
  rows: state.rows,
  cols: state.cols,
  playerCount: state.players.length,
}));
applyButton.addEventListener("click", handleNewMatch);
presetSelect.addEventListener("change", applyPreset);

resetGame({
  rows: BOARD_PRESETS[INITIAL_PRESET].rows,
  cols: BOARD_PRESETS[INITIAL_PRESET].cols,
  playerCount: 2,
});
