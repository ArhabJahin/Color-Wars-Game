# Color Wars / Chain Reaction Game Context

This file is a handoff note for future Codex sessions. Read it first before changing the game.

## What This Game Is

The project is a browser-based board game called **Color Wars** in the UI. The HTML page title is currently **Chain Reaction**.

The game is inspired by Chain Reaction-style territory control:

- Players claim cells with colored dots.
- A player can build up dots in cells they own.
- When a cell reaches its capacity, it explodes and sends one dot to each orthogonal neighbor.
- Explosions convert neighboring cells to the exploding player's color.
- Chain reactions can cascade across the board.
- A player is eliminated when all players have started and that player owns no cells.
- The last active player wins.

## Main Files

- `index.html`
  - Main browser entry point.
  - Loads `styles.css` and the flattened `app.js`.
  - Contains the intro screen, setup controls, game stage, board templates, toss overlay, and player card template.

- `styles.css`
  - All visual styling, layout, responsive sizing, board/cell/orb animations, intro/setup/game screens, and toss visuals.

- `app.js`
  - Flattened single-file runtime used by `index.html`.
  - Contains the engine, player model, AI logic, UI state, rendering, setup controls, toss flow, move handling, animations, and app initialization.
  - If changing gameplay or UI behavior used by the browser, update this file.

- `js/engine.js`
  - Modular source/reference version of the core game engine.
  - Exports board creation, move simulation, legal action checks, scoring helpers, and state encoding.

- `js/ai.js`
  - Modular source/reference version of the AI logic.
  - Exports AI evaluation, move choice, and training scaffolding helpers.

- `js/player-model.js`
  - Player profile/adaptive behavior model source/reference file.

- `artifacts/`
  - Generated screenshots, logs, and local test outputs.
  - Not required for gameplay.

## Current Gameplay Rules In Code

Board presets:

- `5x5`
- `7x7`

Players:

- 2 to 4 players in human mode.
- AI mode forces 2 players.

Player colors:

- Red
- Blue
- Green
- Amber

Move rules:

- On a player's first move, they may claim any empty cell.
- After their first move, they may only play on cells they already own.
- Players cannot play on opponent-owned cells directly.
- If the game has a winner, no more moves are legal.

Cell capacity:

- The current implementation uses `4` for every cell.
- This differs from classic Chain Reaction rules, where corners and edges usually have lower capacity.
- If classic behavior is desired, change `getCapacity()` in both `app.js` and `js/engine.js`.

Explosion behavior:

- A cell explodes when `count >= capacity`.
- The exploding cell becomes empty with count `0`.
- Each orthogonal neighbor receives one dot.
- Neighbor ownership changes to the explosion owner.
- Cascades continue until no cell is overloaded.

Winner/elimination:

- Eliminations are only evaluated after all players have made at least one move.
- A player with zero owned cells after everyone has started is eliminated.
- If only one active player remains, that player wins.

## Match Flow

1. The page opens on the intro screen.
2. Press `PLAY` to open match setup.
3. Choose mode, difficulty, board size, and player count.
4. Press setup `PLAY`.
5. A toss chooses the first player.
6. The board becomes interactive.
7. The turn badge shows whose turn it is.
8. Score badges show total dots owned by each player.
9. A hold-style back button returns from the game to setup/options.

## Modes And AI

Modes:

- Human vs Human
- Human vs AI

AI difficulties:

- Easy
- Medium
- Hard
- Adaptive

AI behavior:

- Uses heuristic scoring over legal moves.
- Medium/hard/adaptive use shallow minimax with beam pruning.
- Adaptive mode uses a local player profile saved in `localStorage`.
- The AI profile tracks move heatmaps, preferred regions, risk, aggression, chain preference, critical targeting, and outcomes.

## UI Notes

The UI is designed as a compact game surface, not a landing page.

Important visible pieces:

- Intro title: `COLOR WARS`
- Subtitle: `Occupy the field with your color.`
- Large central play button.
- Setup bar with custom select controls.
- Game board with square cells.
- Floating turn badge.
- Score badges around the board.
- Toss overlay.
- Hold-to-options back button.

Responsive behavior:

- The board size is calculated dynamically in `updateBoardSizing()`.
- Mobile and desktop layouts were checked with screenshots.
- Text/button overflow was not observed in the last check.

## How To Run

The game is static HTML/CSS/JS.

Recommended local run command from the project root:

```powershell
python -m http.server 5521 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:5521/index.html
```

Directly opening `index.html` may work, but serving over local HTTP is safer for browser testing.

## Verification Already Done

The following checks were run successfully:

- `node --check app.js`
- `node --check js\engine.js`
- `node --check js\ai.js`
- Browser initialization through local HTTP.
- Intro screen loads.
- Setup opens.
- Match starts.
- Toss completes.
- Board renders 25 cells for 5x5.
- Legal cells enable/disable correctly.
- A move places an orb and advances the turn.
- Mobile-size board layout renders without obvious overflow.
- Live play state was inspected while the user was playing:
  - 25 board cells.
  - No console errors.
  - Red to move.
  - 4 legal Red moves at that moment.

Known non-fatal logs:

- Google Fonts can be blocked in restricted environments.
- `favicon.ico` may 404 because no favicon is provided.

## Known Issues / Things To Watch

- `index.html` title says `Chain Reaction`, while the visible game brand says `COLOR WARS`.
- `getCapacity()` always returns `4`; confirm whether this is intentional.
- `app.js` is the browser-loaded file. If editing modular files in `js/`, mirror gameplay changes into `app.js` or add a build step.
- Existing `artifacts/` files are generated and should not be treated as source.
- Local servers started from previous Codex sessions may not persist across restarts.

## Good Future Tasks

- Add a favicon to remove the 404.
- Decide whether the title should be `Color Wars`.
- Decide whether cell capacities should be classic Chain Reaction values:
  - corner: 2
  - edge: 3
  - center: 4
- Add a small README with run instructions for humans.
- Add automated engine tests for move legality, explosions, elimination, and AI legal move selection.
- Consider replacing flattened `app.js` with a proper module build if the project grows.

