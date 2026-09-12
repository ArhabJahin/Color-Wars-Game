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
  - Loads `styles.css?v=20260527-online` and the flattened `app.js?v=20260527-online`.
  - Contains the intro screen, setup controls, game stage, board templates, toss overlay, and player card template.
  - Contains the `Online PvP` mode option and online lobby controls.
  - Contains the top-right settings button `#settingsButton`, which is hidden on the initial front page and shown after `PLAY` opens setup.
  - Contains the settings panel `#settingsPanel`, where the username, sound controls, and theme toggle now live.
  - Uses an inline SVG data favicon so local HTTP loads do not request `/favicon.ico`.
  - No longer loads Google Fonts from the network; CSS falls back to local rounded/system fonts.

- `styles.css`
  - All visual styling, layout, responsive sizing, board/cell/orb animations, intro/setup/game screens, and toss visuals.
  - Owns the light theme, dark theme, turn-based background colors, transparent board-frame gaps, settings panel styling, and theme toggle icon styling.

- `app.js`
  - Flattened single-file runtime used by `index.html`.
  - Contains the engine, player model, AI logic, UI state, rendering, setup controls, toss flow, move handling, animations, and app initialization.
  - If changing gameplay or UI behavior used by the browser, update this file.
  - Contains small theme persistence logic only; gameplay/AI/board/player rules should remain separate from theme changes.
  - Contains the generated Web Audio sound system, mute persistence, audio unlock handling, and sound hooks.
  - Contains the settings panel open/close behavior and display refresh for settings volume/theme text.
  - Contains online matchmaking/client logic for Socket.IO queues, username persistence, reconnect identity, server-authoritative online moves, and synchronized online toss playback.

- `server/package.json`
  - Node server package for online PvP.
  - Defines `npm start` as `node index.js`.
  - Depends on Express and Socket.IO.

- `server/index.js`
  - Express + Socket.IO entry point for online PvP.
  - Serves the project root as static files.
  - Blocks direct HTTP access to `/server/*` and `/.git/*` before static handling so server internals are not exposed.
  - Default port is `5522`, so online mode should be opened from `http://127.0.0.1:5522/index.html`.
  - Exposes `/health`.

- `server/matchmaking.js`
  - Authoritative online matchmaking and match manager.
  - Maintains separate queues by board preset and requested player count.
  - Assigns colors in order, broadcasts waiting queue updates, starts full matches automatically, validates turn ownership, applies moves, and marks disconnects.

- `server/validation.js`
  - Server-side mirror of the current engine rules used for online move validation/simulation.
  - Keeps the exact player colors and current capacity-4 rule.

- `.gitignore`
  - Ignores `server/node_modules/` and transient `server/server-*.log` files.

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
- Online PvP supports automatic matchmaking for 2, 3, and 4 total players.

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
- Online PvP

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

Online PvP behavior:

- The mode selector has a third option named `Online PvP`.
- Online mode keeps the normal setup `PLAY` button.
- The player chooses board size and total player count, then presses setup `PLAY` to enter matchmaking.
- AI difficulty controls are disabled in online mode.
- The server maintains separate queues by requested board preset and player count, such as 2-player 5x5, 3-player 5x5, and 4-player 7x7.
- The matchmaking screen shows `Searching for players`, the current joined count, matched display names, and a Cancel button.
- Waiting messages use the current count, for example `Waiting for players... 1/2 joined.` or `2/4 joined - waiting for 2 more players.`
- If a waiting player disconnects or cancels, they are removed from the queue and remaining waiting players receive an updated joined count.
- When the queue reaches the selected player count, the server creates the match and starts it automatically. There is no Create Room, Join Room, Room Code, Ready, or host Start flow in the primary UI.
- The server assigns colors in order: Red, Blue, Green, Amber.
- The matchmaking and match lists show player color, display name, local `You` badge, and connected/disconnected state.
- The server chooses the toss winner and broadcasts it. Clients play the existing toss animation/sounds using that server-chosen result.
- During online play, only the current player's browser enables legal cells. Other players see the board but cannot move.
- If the current online player disconnects, the turn banner/status shows that player's disconnected state.
- Moves are sent to the server through Socket.IO. The server validates match membership, connection state, current turn, action shape, and move legality before simulating.
- The server broadcasts the updated state and animation frames. Clients replay the same chain reaction frames through the existing `playFrame()` and `animateTransfers()` path.
- Client input is locked after sending an online move until the server response/event arrives.
- If the Socket.IO client script cannot load because the online server is unavailable, the app shows a graceful lobby error and clears the cached load attempt so the user can start the server and retry.
- Refresh/reconnect support is basic: each browser stores `chain-reaction-client-id`, and the last online match id is stored under `chain-reaction-online-match-id`. Reconnecting with the same client id and match id restores that color slot when the in-memory server match still exists.

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
- Settings icon button in the top-right of the setup/options screen, hidden from the initial front page.
- Settings panel with username, sound volume/mute controls, and the light/dark theme toggle.
- Online matchmaking panel with joined count, matched player names, status messages, and Cancel action.

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

Settings page behavior:

- `index.html` has a real top-right button: `#settingsButton`.
- `#settingsButton` is intentionally hidden on the first front page so the landing view stays clean.
- `#settingsButton` is shown on the setup/options view after the user presses the main `PLAY` button.
- The settings icon is a clean inline SVG right-aligned stacked-lines icon, matching the provided reference style and not using an external image file.
- The settings button has no visible circle, border, background fill, or shadow; only the transparent-style line icon should be visible.
- The settings icon lines now use the player colors in order: blue, red, green, amber.
- `#settingsButton` opens `#settingsPanel`, adds `body.settings-open`, closes any custom select menus, refreshes the displayed volume/theme state, and focuses `#settingsBackButton`.
- `#settingsBackButton` closes the settings panel and returns focus to `#settingsButton`.
- Pressing Escape closes the settings panel when it is open.
- The settings page title is `SETTINGS`.
- The normal floating/global sound controls were removed from the main intro/setup/game UI; sound controls are only visible inside the settings panel.
- Keep the settings UI game-like and consistent with the existing rounded dark-panel style.

Username settings behavior:

- The settings panel includes `#usernameInput`, `#usernameSaveButton`, and `#usernameStatus`.
- Usernames are optional and saved in `localStorage` under `chain-reaction-username`.
- Empty saved usernames are cleared and online matches use generated color names like `Red #A42F`.
- Valid usernames are trimmed, 3-16 characters, and may contain letters, numbers, spaces, underscores, and hyphens.
- Invalid usernames are not saved.
- Online queues/matches keep display names unique by adding a short suffix when needed.

Theme toggle behavior:

- `index.html` has a real button: `#themeToggle`.
- `#themeToggle` now lives inside `#settingsPanel` rather than the top-right intro/menu position.
- The button shows a moon icon while light theme is active.
- The button shows a sun icon while dark theme is active.
- `app.js` stores the selected theme in `localStorage` under `chain-reaction-theme`.
- `app.js` applies `document.body.dataset.theme` as either `light` or `dark`.
- `#themeValue` displays the current theme as `Light` or `Dark` in the settings panel.
- The button aria label and title switch between `Switch to dark theme` and `Switch to light theme`.
- Keep this keyboard accessible and do not replace it with a non-button element.

Sound behavior:

- `index.html` has a settings-page sound control cluster:
  - `#volumeDownButton`
  - `#soundToggle`
  - `#volumeUpButton`
- `#volumeValue` displays the current percentage, for example `Volume 100%`.
- The buttons are icon/symbol-only, keyboard accessible, and `#soundToggle` uses `aria-pressed` to reflect muted state.
- `app.js` uses generated Web Audio API tones only; there are no external audio files.
- Sounds are intentionally soft, short, low-volume, and puzzle-game-like.
- Audio is not created or resumed until the first user gesture through the sound unlock listeners in `initializeSoundControls()`.
- If Web Audio is unsupported or blocked, the system fails silently and gameplay continues.
- The mute preference is stored in `localStorage` under `chain-reaction-sound-muted`.
- The volume preference is stored in `localStorage` under `chain-reaction-sound-volume`.
- Volume is clamped between `0.3` and `1`, defaults to `1`, and uses `SOUND_MASTER_GAIN = 3.4` for clearer audibility on laptop/mobile speakers.
- Volume up/down buttons play short gentle confirmation tones and update their accessible labels with the current volume percentage.
- Sound hooks currently include:
  - UI tap feedback through `handleUiSoundClick()`.
  - Cell placement in `commitMove()`.
  - Gentle chain pops for transfer frames in `playFrame()`.
  - Toss start/reveal in `runStartToss()`.
  - Gentle circling toss audio through `startTossSpinSound()` while the toss ring/coin are spinning.
  - Subtle turn-change tap in `syncStatus()`.
  - Win chime after winner detection in `commitMove()`.
- Keep all future sound changes generated, subtle, and non-aggressive; do not add arcade beeps, bass hits, harsh noise, or real explosion effects.
- Sound audibility was adjusted after the first implementations were too quiet on real speakers:
  - `SOUND_MASTER_GAIN` is `3.4`.
  - `SOUND_DEFAULT_VOLUME` is `1`.
  - `SOUND_MIN_VOLUME` is `0.3` so old saved low-volume values are lifted on load.
  - Per-sound gains/durations are still short and gentle, but no longer near-inaudible.
  - `playGameSound()` now waits for `unlockAudio()` and retries once after the browser audio context starts, so sounds are not dropped while the context is resuming.
  - `unlockAudio()` includes a near-silent primer oscillator to improve mobile/browser audio startup reliability.
  - Toss spin audio uses a short repeating `tossSpin` sound with slight pitch motion and optional stereo panning. It starts immediately after `tossStart`, repeats every ~190 ms, and is stopped before `tossReveal` or whenever the toss overlay is hidden.
  - Toss spin was boosted after user feedback: primary spin tone gain is `0.075`, secondary tone gain is `0.038`.
  - Win audio is a warm generated success chime: a short rounded arpeggio with a soft major chord tail. Avoid high sparkly tones, bass hits, harsh effects, or arcade fanfares.

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
- The setup screen uses denser controls on narrow or short screens so the setup `PLAY` button remains visible without needing an initial scroll.
- On narrow screens, setup controls stay in a compact two-column grid with clipped select text where needed.

## How To Run

The game is static HTML/CSS/JS.

Offline-only local run command from the project root:

```powershell
python -m http.server 5521 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:5521/index.html
```

Directly opening `index.html` may work, but serving over local HTTP is safer for browser testing.

Online PvP requires the Node server:

```powershell
cd server
npm install
npm start
```

Then open the game from the server origin:

```text
http://127.0.0.1:5522/index.html
```

Use separate browser tabs/windows or separate browser profiles/contexts, choose matching Online PvP settings, and press setup `PLAY` in each client to enter the same matchmaking queue. Opening the static Python server on port `5521` keeps offline modes playable but does not provide Socket.IO for Online PvP.

## Verification Already Done

The following checks were run successfully:

- `node --check app.js`
- `node --check js\engine.js`
- `node --check js\ai.js`
- `node --check js\player-model.js`
- `node --check server\index.js`
- `node --check server\matchmaking.js`
- `node --check server\validation.js`
- `npm install` in `server/` completed successfully and installed Express/Socket.IO with no vulnerabilities reported.
- Current Online PvP matchmaking automated browser verification through `http://127.0.0.1:5522/index.html`:
  - Offline Human vs Human still started on a mobile-sized viewport, toss completed, and playable cells were enabled.
  - Human vs AI still started, tossed, and rendered a 25-cell board.
  - Online PvP appeared in the mode selector.
  - Online mode disabled AI Difficulty while keeping Players active.
  - Cancel matchmaking worked and removed `body.matchmaking-open`.
  - 2-player matchmaking showed `1/2`, matched the second client, auto-started, and completed the synchronized server toss on both clients.
  - Non-current player had 0 enabled cells before the move.
  - Current player moved successfully.
  - Board state synced across both clients after the move.
  - 3-player matchmaking showed `1/3`, then `2/3` with matched names, and auto-started at `3/3`.
  - 4-player matchmaking showed `1/4`, `2/4`, `3/4`, and auto-started at `4/4` on a 7x7 board.
  - A waiting-player disconnect updated the remaining client from `2/3` back to `1/3`.
  - No page errors or browser console errors were reported after removing the external font request and adding the inline favicon.
- Settings automated browser verification through `http://127.0.0.1:5522/index.html`:
  - Settings opened from setup on a mobile-sized viewport.
  - Invalid 2-character username was rejected.
  - Valid username `Player_One` saved to `chain-reaction-username`.
  - Theme toggle persisted `chain-reaction-theme`.
  - Volume down persisted `chain-reaction-sound-volume`.
  - Settings back button closed the panel.
  - No page errors or browser console errors were reported.
- Server matchmaking-store verification:
  - 2-player, 3-player, and 4-player queues auto-started matches when full.
  - 3-player queue showed 2/3 before the final player joined.
  - 4-player queue showed 2/4 and 3/4 before the final player joined.
  - Waiting-player cancel and disconnect updated queue snapshots.
  - Duplicate usernames were made unique inside the queue.
  - Fallback color/code names were generated when username was empty.
  - Server rejected a move from a player who was not current with `Not your turn.`
  - Server accepted a legal current-player move and returned animation frames.
  - A near-chain state returned more than one animation frame.
  - Duplicate/wrong-late moves were rejected by the server.
  - A near-end match state was applied and the server returned winner `red` with match status `ended`, confirming winner state is included in the authoritative match snapshot.
  - Basic reconnect by client id and match id succeeded in the store.
- Server static safety verification:
  - `/health` returned 200.
  - `/index.html` returned 200.
  - `/server/matchmaking.js` returned 404.
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
- Sound system verification:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - Browser loaded `styles.css?v=20260526-sound-fix` and `app.js?v=20260526-sound-fix`.
  - After the audibility fix, the browser loaded the cache-busted assets, sound was unmuted (`aria-pressed="false"`), toss/play/move flow still worked, and no console errors were reported.
  - Volume-control verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Browser loaded `styles.css?v=20260526-sound-volume` and `app.js?v=20260526-sound-volume`.
    - Fresh-origin default volume showed `Mute sound, volume 85%`.
    - Volume up/down buttons updated labels and disabled states correctly.
    - Running `127.0.0.1:5521` browser state was left unmuted at `100%` volume for manual testing.
    - Toss/play flow still rendered 25 cells and no browser console errors were reported.
  - Toss spin sound verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260526-sound-spin` and `app.js?v=20260526-sound-spin`.
    - In-app browser verification could not run because no active Codex browser pane was available.
  - Sound boost verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260526-sound-boost` and `app.js?v=20260526-sound-boost`.
  - Second sound boost verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260526-sound-boost2` and `app.js?v=20260526-sound-boost2`.
  - Win chime verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260526-win-chime` and `app.js?v=20260526-win-chime`.
  - Warm win chime verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260526-win-warm` and `app.js?v=20260526-win-warm`.
  - Toss spin volume verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260526-toss-spin-up` and `app.js?v=20260526-toss-spin-up`.
  - Third sound boost verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260526-sound-boost3` and `app.js?v=20260526-sound-boost3`.
  - Settings page verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260527-settings` and `app.js?v=20260527-settings`.
    - Local server response contained `#settingsButton`, `#settingsPanel`, `#volumeValue`, and `#themeValue`.
    - Player color constants were checked and remained exact.
    - In-app browser manual verification could not run in this session because no active Codex browser pane was available.
    - Headless Chrome/Edge CDP fallback was attempted but could not complete reliably because the browser processes exited with GPU-process failures before the UI flow finished.
  - Responsive setup/settings/game verification:
    - A local Chrome instance with remote debugging was used after the in-app browser was unavailable.
    - Local server response contained `styles.css?v=20260527-responsive` and `app.js?v=20260527-responsive`.
    - Checked 1365x768, 900x500, 360x640, and 320x568 viewport cases.
    - Setup `PLAY` stayed in the viewport after the compact setup CSS changes.
    - Settings panel controls stayed in the viewport with no horizontal overflow.
    - 7x7 four-player games started and rendered 49 board cells on the checked viewport sizes.
    - No text overflow or board/player-card overlap was reported by the layout probe.
  - Settings icon/front-page verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260527-settings-icon` and `app.js?v=20260527-settings-icon`.
    - Local Chrome remote-debug verification confirmed the initial front page hides `#settingsButton`; setup view shows it as a 50px inline-SVG icon button.
    - The button used inline SVG markup and still opened the settings panel from setup.
  - Right-align settings icon verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260527-settings-align` and `app.js?v=20260527-settings-align`.
    - The settings button uses `.settings-align-icon` inline SVG with four right-aligned rounded strokes.
  - Transparent settings icon verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260527-settings-transparent` and `app.js?v=20260527-settings-transparent`.
    - `.settings-button` uses transparent background, no border, and no shadow so the visible control is only the right-align icon.
  - Colored settings icon verification:
    - `node --check app.js`
    - `node --check js\engine.js`
    - `node --check js\ai.js`
    - `node --check js\player-model.js`
    - Local server response contained `styles.css?v=20260527-settings-colors` and `app.js?v=20260527-settings-colors`.
    - `.settings-align-icon` path strokes now use `var(--blue)`, `var(--red)`, `var(--green)`, and `var(--amber)`.
  - `#soundToggle` rendered, toggled between mute/unmute states, and retained the unmuted state after reload.
  - Intro/setup/play flow still worked after adding sound hooks.
  - Toss completed, 25 cells rendered for 5x5, a cell move placed one orb, and the turn advanced.
  - No browser console errors were reported during the sound smoke test.
- Winner back-button verification:
  - During an active match, `#gameBackButton` label remained `Hold to return to options`.
  - A real 5x5 match was driven to a win through browser clicks.
  - After the win banner appeared, `#gameBackButton` label changed to `Return to game menu`.
  - One click on the winner-state back button returned the page to `intro-open setup-open`.
  - No browser console errors or warnings appeared during this check.

## Known Issues / Things To Watch

- `index.html` title says `Chain Reaction`, while the visible game brand says `COLOR WARS`.
- `getCapacity()` always returns `4`; confirm whether this is intentional.
- `app.js` is the browser-loaded file. If editing modular files in `js/`, mirror gameplay changes into `app.js` or add a build step.
- `server/validation.js` mirrors the engine rules for online server authority. If gameplay rules change, update the browser engine and server validation together.
- Online queues and matches are in memory only. Restarting the Node server clears waiting queues and active matches.
- Reconnect is client-id/match-id based and intentionally basic; there is no account system or long-term persistence.
- Existing `artifacts/` files are generated and should not be treated as source.
- Local servers started from previous Codex sessions may not persist across restarts.
- `styles.css` currently contains most UI behavior and is large. Prefer small, scoped CSS edits for visual changes.
- Do not reintroduce a filled board panel behind the cells unless the user asks for it; the current requested look is transparent space between boxes.
- Do not change theme work in a way that alters gameplay, AI, board, or player logic.

## Good Future Tasks

- Decide whether the title should be `Color Wars`.
- Decide whether cell capacities should be classic Chain Reaction values:
  - corner: 2
  - edge: 3
  - center: 4
- Add a small README with run instructions for humans.
- Add automated engine tests for move legality, explosions, elimination, and AI legal move selection.
- Add automated Socket.IO integration tests for online reconnect/disconnect and winner sync.
- Consider replacing flattened `app.js` with a proper module build if the project grows.
