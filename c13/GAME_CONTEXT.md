# Color Wars / Chain Reaction Game Context

This file is a handoff note for future Codex sessions. Read it first before changing the game.

## Standing Instruction

- Anytime any source, style, markup, behavior, asset, or documentation change is made in this project, update this `GAME_CONTEXT.md` file in the same turn with the relevant new context.
- Keep this file current enough that a fresh Codex session can understand the game, current UI direction, important constraints, and recent implementation decisions.
- Do not leave code changes undocumented here.

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
  - Loads `styles.css?v=20260526-theme` and the flattened `app.js?v=20260526-theme`.
  - Contains the intro screen, setup controls, game stage, board templates, toss overlay, and player card template.
  - Contains the theme toggle button `#themeToggle` on the intro/menu screen.

- `styles.css`
  - All visual styling, layout, responsive sizing, board/cell/orb animations, intro/setup/game screens, and toss visuals.
  - Owns the light theme, dark theme, turn-based background colors, transparent board-frame gaps, and theme toggle icon styling.

- `app.js`
  - Flattened single-file runtime used by `index.html`.
  - Contains the engine, player model, AI logic, UI state, rendering, setup controls, toss flow, move handling, animations, and app initialization.
  - If changing gameplay or UI behavior used by the browser, update this file.
  - Contains small theme persistence logic only; gameplay/AI/board/player rules should remain separate from theme changes.

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

- Red: `#ff5a62`
- Blue: `#16bfe8`
- Green: `#78d447`
- Amber: `#ffc43b`

These exact values are important. Do not change them when redesigning UI themes, backgrounds, cards, board, or cells.

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
9. During active matches, a hold-style back button returns from the game to setup/options.
10. After a winner is declared, the same game back button changes to a one-tap return to the game menu/setup screen.

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
- Hold-to-options back button during active matches.
- One-tap game-menu back button after a winner is declared.
- Theme toggle button in the top-right of the intro/menu screen.

Current visual direction:

- The light gameplay theme uses a clean flat vector-style background.
- The light background changes by current player turn through `body[data-turn="red"]`, `body[data-turn="blue"]`, `body[data-turn="green"]`, and `body[data-turn="amber"]`.
- The light background is built from CSS variables such as `--bg-base`, `--bg-shape-1`, `--bg-shape-2`, `--bg-shape-3`, `--bg-band-1`, and `--bg-band-2`.
- The vector background uses large static shapes and subtle grid texture. There should be no pulsing, blinking, breathing glow, or infinite background animation.
- The board frame background is intentionally transparent so the spaces between cell boxes show the gameplay background.
- Cells remain neutral light gray-blue in the light theme so player orbs stay readable.
- The dark gameplay theme restores the older dark board/cell feel: dark slate background, gray 3D rounded cells, dark score cards, and bright player pieces.
- The dark background also changes by current player turn using `body[data-theme="dark"][data-turn="..."]`.
- The dark board frame is also transparent between cells, with only a subtle border/shadow around the board.

Theme toggle behavior:

- `index.html` has a real button: `#themeToggle`.
- The button shows a moon icon while light theme is active.
- The button shows a sun icon while dark theme is active.
- `app.js` stores the selected theme in `localStorage` under `chain-reaction-theme`.
- `app.js` applies `document.body.dataset.theme` as either `light` or `dark`.
- The button aria label and title switch between `Switch to dark theme` and `Switch to light theme`.
- Keep this keyboard accessible and do not replace it with a non-button element.

Game back button behavior:

- `#gameBackButton` uses hold-to-return behavior while a match is still active.
- When `uiState.game.winner` is set, `#gameBackButton` should return to the menu/setup screen with one tap/click instead of requiring a hold.
- The winner-state back label is `Return to game menu`.
- This is UI behavior only; it must not change move legality, winner detection, AI logic, board state, or player logic.

Responsive behavior:

- The board size is calculated dynamically in `updateBoardSizing()`.
- Mobile and desktop layouts were checked with screenshots.
- Text/button overflow was not observed in the last check.
- Board gaps should remain visible and transparent on desktop, tablet, mobile portrait, and short-height screens.

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
- Theme toggle verification:
  - Light theme loaded by default when no saved theme was present.
  - Toggle switched to dark theme.
  - Dark theme persisted after refresh through `localStorage`.
  - Toggle switched back to light theme.
  - Moon/sun icon visibility and aria labels updated correctly.
- Dark gameplay verification:
  - Dark board/cell style used gray 3D cells and dark score cards.
  - Dark turn background changed from red theme to blue theme after a legal move.
  - Red, Blue, Green, and Amber CSS values remained exact.
- Transparent board-gap verification:
  - `.board-frame` computed background was `rgba(0, 0, 0, 0)`.
  - `.board-frame` computed background image was `none`.
  - Cell tile gradients still rendered.
  - No horizontal scrolling appeared.
- Winner back-button verification:
  - During an active match, `#gameBackButton` label remained `Hold to return to options`.
  - A real 5x5 match was driven to a win through browser clicks.
  - After the win banner appeared, `#gameBackButton` label changed to `Return to game menu`.
  - One click on the winner-state back button returned the page to `intro-open setup-open`.
  - No browser console errors or warnings appeared during this check.

Known non-fatal logs:

- Google Fonts can be blocked in restricted environments.
- `favicon.ico` may 404 because no favicon is provided.

## Known Issues / Things To Watch

- `index.html` title says `Chain Reaction`, while the visible game brand says `COLOR WARS`.
- `getCapacity()` always returns `4`; confirm whether this is intentional.
- `app.js` is the browser-loaded file. If editing modular files in `js/`, mirror gameplay changes into `app.js` or add a build step.
- Existing `artifacts/` files are generated and should not be treated as source.
- Local servers started from previous Codex sessions may not persist across restarts.
- `styles.css` currently contains most UI behavior and is large. Prefer small, scoped CSS edits for visual changes.
- Do not reintroduce a filled board panel behind the cells unless the user asks for it; the current requested look is transparent space between boxes.
- Do not change theme work in a way that alters gameplay, AI, board, or player logic.

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
