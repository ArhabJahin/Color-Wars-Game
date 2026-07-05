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
  - Loads `styles.css?v=20260608-mobile-7x7-centered-grid` and the flattened `app.js?v=20260608-navigation-state-fix`.
  - Contains the intro screen, setup controls, game stage, board templates, toss overlay, and player card template.
  - Contains the `Online PvP` mode option and online lobby controls.
  - Contains the top-right settings button `#settingsButton`, which is hidden on the initial front page and shown after `PLAY` opens setup.
  - Contains the settings panel `#settingsPanel`, where the username, sound controls, and theme toggle now live.
  - Contains Online PvP recovery buttons `#onlineRejoinButton` and `#onlineForfeitButton` inside the online lobby actions.
  - Uses an inline SVG data favicon so local HTTP loads do not request `/favicon.ico`.
  - No longer loads Google Fonts from the network; CSS falls back to local rounded/system fonts.

- `styles.css`
  - All visual styling, layout, responsive sizing, board/cell/orb animations, intro/setup/game screens, and toss visuals.
  - Owns the light theme, dark theme, turn-based background colors, transparent board-frame gaps, settings panel styling, and theme toggle icon styling.
  - The current orb/explosion animation style is intentionally preserved; only existing animation and transition durations were lengthened slightly for calmer readability.
  - Mobile layout now clips horizontal overflow at the document/shell level and also fixes the actual setup/options and Online PvP lobby widths so mobile pages do not wobble left-right.
  - Active mobile game screens are overflow-locked and use a board shell whose width is the computed real grid size, clamped by `100svw`/`100vw` safe guards so 7x7 can grow without right-side clipping.
  - On mobile 7x7 only, the transparent `.board-frame` padding, border, and shadow are removed so the actual 7x7 cell grid can use nearly the full phone width without hidden frame overflow.

- `app.js`
  - Flattened single-file runtime used by `index.html`.
  - Contains the engine, player model, AI logic, UI state, rendering, setup controls, toss flow, move handling, animations, and app initialization.
  - If changing gameplay or UI behavior used by the browser, update this file.
  - Contains small theme persistence logic only; gameplay/AI/board/player rules should remain separate from theme changes.
  - Contains the generated Web Audio sound system, mute persistence, audio unlock handling, and sound hooks.
  - Mobile Web Audio unlock now retries on real `pointerdown`, `touchstart`, `click`, and `keydown` gestures until the `AudioContext` is actually running. Main PLAY, setup PLAY, board taps, restart, sound toggle, volume buttons, and the settings Enable/Test Sound button explicitly request unlock/resume.
  - Contains a disabled `ENABLE_LAYOUT_OVERFLOW_DIAGNOSTICS` helper that can log elements wider than the viewport during future mobile overflow debugging; it must remain `false` outside debugging.
  - Contains the settings panel open/close behavior and display refresh for settings volume/theme text.
  - Contains online matchmaking/client logic for Socket.IO queues, username persistence, reconnect identity, server-authoritative online moves, and synchronized online toss playback.
  - Screen navigation is centralized through `showIntroScreen()`, `showSetupScreen()`, and `showGameScreen()` so intro/setup/game transitions clear conflicting body classes and stale Online PvP lobby state.
  - `resetOnlineMatchmakingUi()` clears local matchmaking flags, queue snapshots, recovery notices, timers, and lobby visibility so cancel/back paths immediately unlock setup controls before any Socket.IO callback returns.
  - `renderOnlineLobby()` is scoped to `body.setup-open`, preventing late async online recovery/cancel callbacks from re-opening the lobby while the front page or game board is active.
  - Socket.IO `online:queueUpdate` snapshots are ignored unless the client is still locally matchmaking, preventing late queue broadcasts from re-locking setup after Cancel/Back.
  - Contains the local-only player color preference system, offline visual color assignment, and per-client Online PvP visual color maps.
  - Keeps timing-only animation constants for the existing sequence: `PLACEMENT_ANIMATION_MS = 240`, `CHAIN_FRAME_DELAY_MS = 300`, `TRANSFER_ANIMATION_MS = 560`, and `ANIMATION_STEP_MS = CHAIN_FRAME_DELAY_MS`.
  - `updateBoardSizing()` is preset-aware. It uses a stable board viewport snapshot, tags the board with `data-board-preset`, computes the real grid size separately from any frame size, and ignores height-only mobile browser chrome changes unless orientation or real width changes.
  - Mobile portrait 7x7 now calculates cell size from viewport width with `24px` total side reserve, no board-frame padding, tighter integer gaps, and reduced vertical reserves so the real 7x7 grid has equal left/right gaps.

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
  - Socket.IO events currently include `online:joinQueue`, `online:cancelQueue`, `online:getActiveMatch`, `online:reconnectMatch`, `online:forfeitMatch`, `online:leaveMatchView`, `online:updateProfile`, `online:move`, and `online:animationComplete`.

- `server/matchmaking.js`
  - Authoritative online matchmaking and match manager.
  - Maintains separate queues by board preset and requested player count.
  - Assigns colors in order, broadcasts waiting queue updates, starts full matches automatically, validates turn ownership, applies moves, handles reconnect recovery, handles forfeit/timeout outcomes, marks disconnects, and owns the Online PvP move timer.
  - Uses `RECONNECT_GRACE_MS = 30_000`, `ENDED_MATCH_CLEANUP_MS = 120_000`, `BOT_MOVE_DELAY_MS = 1700`, `PERMANENT_BOT_MOVE_DELAY_MS = 1700`, `TIMEOUT_ASSIST_BOT_MOVE_DELAY_MS = 600`, `ONLINE_TURN_TIME_MS = 20_000`, `ONLINE_TOSS_DELAY_MS = 3_000`, `ONLINE_IDLE_STRIKE_LIMIT = 2`, `ONLINE_FINAL_WARNING_TIME_MS = 10_000`, `TIMEOUT_NOTICE_FLASH_MS = 700`, `ONLINE_MOVE_FIRST_FRAME_MS = 260`, `ONLINE_MOVE_FRAME_MS = 900`, `ONLINE_MOVE_RESOLVE_BUFFER_MS = 350`, `ONLINE_MOVE_RESOLVE_MIN_MS = 900`, `ONLINE_MOVE_RESOLVE_MAX_MS = 12_000`, and `ONLINE_MOVE_RESOLVE_FALLBACK_MS = 12_000`.
  - Online bot/timer diagnostics are disabled by default and can be enabled on the server with `COLOR_WARS_DEBUG_ONLINE=1`.

- `server/bot.js`
  - Server-only bot move chooser for abandoned 3-player and 4-player online seats.
  - Uses server validation helpers only. It prefers legal moves that trigger chain reactions, then owned/high-dot cells, with random tie-breaking.

- `server/validation.js`
  - Server-side mirror of the current engine rules used for online move validation/simulation.
  - Keeps the exact player colors and current capacity-4 rule.

- `.gitignore`
  - Ignores `server/node_modules/` and transient `server/server-*.log` files.

- `run-color-wars.bat`
  - Windows double-click launcher for the project.
  - Starts the Node online server from `server/index.js`, opens `http://127.0.0.1:5522/index.html`, and keeps the console window open while the server is running.
  - If `server/node_modules/` is missing, it runs `npm install` in `server/` before starting.
  - If port `5522` is already listening, it opens the game URL instead of trying to start a duplicate server.

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

Responsive board sizing:

- Board sizing is calculated in `app.js` by `updateBoardSizing()`, which sets `--rows`, `--cols`, `--cell-size`, `--board-gap`, `--frame-pad`, `--board-grid-size`, and `--board-size` on `.board-shell`.
- The board shell and board element receive `data-board-preset`, such as `7x7`, so CSS can apply preset-specific mobile safety rules without changing gameplay.
- On portrait mobile viewports, 7x7 sizing calculates the real visible grid width as `cellSize * 7 + gap * 6`; this value is stored in `--board-grid-size` and centered directly, instead of centering only the shell.
- The current mobile 7x7 safe side reserve is `24px` total, with CSS clamps based on `100svw - 24px` and `100vw - 24px`. This targets roughly `12px` or more of left/right breathing room on common phone widths and leaves room for cell shadows.
- 7x7 mobile uses an integer gap of `floor(1vw)` clamped from `3px` to `5px`, and frame padding is `0px`. The cell size is derived from the already-constrained grid size, so gaps cannot push the final board wider than the viewport.
- On mobile 7x7, `.board-frame` has `padding: 0`, `border: 0`, and `box-shadow: none`; this removes the transparent oversized frame that could visually waste space or extend past the safe board width. Desktop and 5x5 frame styling are preserved.
- Mobile game-stage horizontal padding is removed for active board play so the centered grid aligns to the viewport, while score badges remain absolutely positioned and do not participate in board layout.
- A stable board viewport is captured when the game board opens. Resize handling is debounced at `160ms`; height-only mobile address-bar changes are ignored, while orientation changes or real width changes reset the stable board viewport and recalculate sizing.
- Active board screens use `overflow: hidden`, `overscroll-behavior: none`, and `touch-action: manipulation` on the game stage so the page does not wobble or drag while playing. Setup/settings/lobby surfaces keep their own scrolling behavior where needed.
- 5x5 and desktop/laptop board sizing keep the previous general sizing path.

Players:

- 2 to 4 players in human mode.
- AI mode forces 2 players.
- Online PvP supports automatic matchmaking for 2, 3, and 4 total players.

Internal server/player slot colors:

- Red: `#ff5a62`
- Blue: `#16bfe8`
- Green: `#78d447`
- Amber: `#ffc43b`

These exact internal slot values are important. Do not change them when redesigning server validation, ownership, reconnect, or matchmaking behavior.

Local visual color palette:

- Red: `#ff5a62`
- Blue: `#16bfe8`
- Green: `#78d447`
- Amber: `#ffc43b`
- Purple: `#9b5cff`
- Pink: `#ff6fb1`
- Cyan: `#28e0d4`
- Orange: `#ff8a3d`
- Lime: `#b7f04a`
- Teal: `#2fd6a3`
- Violet: `#7c7cff`
- Rose: `#ff7a8a`

The full palette is a local visual preference layer. It must not be used as server identity, move validation, ownership, reconnect security, or public Online PvP identity.

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
- The existing animation style, keyframes, transforms, orb positions, transfer paths, and visual effects are preserved. The June 7 timing-only pass lengthened existing durations/waits without adding new animation classes or visual states:
  - Orb width/height/background/transform transitions: `280ms` -> `390ms`.
  - Placement `cell-land`: `380ms` -> `500ms`; placement `orb-pop`: `330ms` -> `430ms`; `cell-ring`: `540ms` -> `700ms`.
  - Existing overloaded-cell animation: `440ms` -> `580ms`.
  - Existing burst-wave animation: `520ms` -> `700ms`.
  - Existing transfer movement: `430ms` -> `560ms`.
  - Existing first placement frame wait: `180ms` -> `240ms`; chain frame delay: `220ms` -> `300ms`.

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
11. The setup/front-page back button now returns to a clean intro screen by clearing `setup-open`/`matchmaking-open`, hiding stale online lobby UI, and resetting transient matchmaking state. Pressing front-page `PLAY` afterward opens the normal setup/options page.
12. Online PvP matchmaking cancellation is local-first: the Cancel button and setup back button immediately clear `onlineState.matchmaking`, clear the queued lobby snapshot, re-enable setup controls, and then notify the server best-effort.
13. The Online PvP lobby is only rendered while setup is open, so late Socket.IO callbacks cannot put the user back into a hidden previous online page after they returned to the front page.
14. Late `online:queueUpdate` broadcasts are ignored after local cancellation, so the Players dropdown does not become disabled again from a stale queue update.

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
- The matchmaking screen shows `Searching for players`, the current joined count, local seat labels such as `You joined`, `Opponent joined`, and a Cancel button.
- Waiting messages use the current count, for example `Waiting for players... 1/2 joined.` or `2/4 joined - waiting for 2 more players.`
- If a waiting player disconnects or cancels, they are removed from the queue and remaining waiting players receive an updated joined count.
- Cancelling matchmaking, going back from the waiting lobby, or receiving a failed/stale cancel response must leave the setup controls editable again. `Players` remains enabled in Online PvP except while actively searching or during an active match recovery.
- When the queue reaches the selected player count, the server creates the match and starts it automatically. There is no Create Room, Join Room, Room Code, Ready, or host Start flow in the primary UI.
- The server assigns internal slots in order: Red, Blue, Green, Amber. These remain authoritative for validation, reconnect, turns, and board ownership.
- Each client translates internal slots into a local visual color map before rendering Online PvP. The local player gets their saved preferred color; opponents get deterministic non-conflicting colors from the remaining palette on that client.
- The per-match visual color map is stored locally under `chain-reaction-online-visual-colors-{matchId}` so reconnect restores the same local colors. Bot takeover keeps that seat's local visual color.
- Online PvP lobby/recovery labels still use neutral local seat labels such as `You`, `Opponent`, `Opponent 2`, and `Opponent 3` where a seat list is clearer.
- Active Online PvP gameplay labels use the client's local visual color names from the per-match visual map for opponents, not usernames, generated fallback ids, or raw server slot names. Examples: `Red to move`, `Purple to move`, `Cyan starts`, `Blue wins`, and `You win`.
- On the local player's own Online PvP turn, the active turn badge shows `Your turn` instead of that player's local visual color. Opponent browsers still show the same current seat by their own local visual color, such as `Red to move` or `Violet to move`.
- Online toss/start text uses `You start` on the local starter's browser; other browsers still see the starter's local visual color, such as `Blue starts`.
- Online board cell accessible labels also use the local visual color name for owned cells during active Online PvP.
- The server chooses the toss winner and broadcasts it. Clients play the existing toss animation/sounds using that server-chosen result.
- During online play, only the current player's browser enables legal cells. Other players see the board but cannot move.
- If the current online player disconnects, the turn banner/status shows that player's disconnected state.
- Moves are sent to the server through Socket.IO. The server validates match membership, connection state, current turn, action shape, and move legality before simulating.
- The server broadcasts the updated state and animation frames. Clients replay the same chain reaction frames through the existing `playFrame()` and `animateTransfers()` path.
- Client input is locked after sending an online move until the server response/event arrives.
- Online PvP has a server-authoritative move timer:
  - `ONLINE_TURN_TIME_MS` is `20_000`.
  - Each playing match snapshot includes `revision`, `phase`, `turnStartedAt`, `turnExpiresAt`, `turnDurationMs`, `lastSkippedPlayerId`, `serverTime`, and any current `systemEvent`.
  - New online matches begin in `phase: "tossing"` with no active turn timer. The server uses `ONLINE_TOSS_DELAY_MS = 3_000` before switching to `phase: "playing"` and starting the first timer, so the first player is not penalized while clients play the toss animation.
  - After the client toss animation finishes, `app.js` refreshes the latest online match snapshot if needed and re-renders board interactivity. This fixes the first-turn lock race where the turn banner showed a playable color but cells stayed disabled until the first timeout bot move.
  - When a snapshot transitions from `tossing` to `playing`, `app.js` clears stale start/toss move locks and legal cells become clickable immediately for the local client whose server seat is current.
  - After every legal human move, timeout-assisted bot move, or permanent abandoned-seat bot move, the server switches the match to `phase: "resolving"` instead of immediately starting the next turn timer.
  - During `resolving`, `turnStartedAt` and `turnExpiresAt` are `null`, human moves are rejected with `Move is resolving.`, normal/final-warning timers do not run, permanent bot timers do not run, and timeout-assisted bot moves cannot trigger.
  - The server calculates a safe resolution delay from the frame count using `ONLINE_MOVE_FIRST_FRAME_MS`, `ONLINE_MOVE_FRAME_MS`, `ONLINE_MOVE_RESOLVE_BUFFER_MS`, and clamps it between `ONLINE_MOVE_RESOLVE_MIN_MS` and `ONLINE_MOVE_RESOLVE_MAX_MS`. These estimates now match the slightly slower timing-only client animation while keeping the visual animation unchanged.
  - Move resolving is now acknowledgement-gated. After replaying a move, each connected non-bot client still viewing the match emits `online:animationComplete` with `{ matchId, clientId, revision }`.
  - `server/matchmaking.js` tracks `pendingAnimationRevision`, `animationExpectedClientIds`, and `animationAckClientIds`. It may finish `resolving` after all expected clients acknowledge and the safe minimum delay has elapsed.
  - `ONLINE_MOVE_RESOLVE_FALLBACK_MS = 12_000` prevents a match from getting stuck if a connected client never acknowledges; the fallback uses the larger of the calculated animation time and the fallback.
  - After resolving finishes, the server switches back to `phase: "playing"`, starts the next human timer if the next seat is human, or schedules the next permanent bot after `PERMANENT_BOT_MOVE_DELAY_MS`.
  - Match snapshots and `online:moveApplied` payloads carry a monotonic `revision`. The browser ignores stale snapshots/events whose revision is older than the latest applied revision.
  - `app.js` serializes `online:moveApplied` events through `onlineState.moveEventQueue`; only one chain animation is replayed at a time.
  - If `online:matchUpdate` arrives while a move animation is replaying, the client stores only the newest snapshot in `onlineState.pendingMatchUpdate` and applies it after the move queue finishes.
  - `app.js` uses `try/finally` during online move playback so `uiState.resolving`, `onlineState.moving`, and queued playback cannot stay stuck if the user leaves during animation.
  - If a connected human does not move before `turnExpiresAt`, the server does not skip the turn. It chooses one legal move for that seat with the server-only bot logic, applies that move through the same authoritative `simulateAction()` path, emits a `turnTimeoutBotMove` system event, broadcasts the move/frames/state, and then advances normally.
  - A timeout-assisted bot move is temporary. The player remains a human seat and can move manually on later turns if they respond before the timer expires.
  - Timeout-assisted bot moves increment that human player's `idleTimeoutCount` and briefly flash the turn badge black on clients.
  - A manual legal human move resets that player's `idleTimeoutCount` to `0` and clears final-warning state.
  - After two consecutive timeout-assisted bot moves, that player's next turn uses `turnTimerMode: "finalWarning"`, `turnDurationMs = 10_000`, and a black timer outline while still showing the local visual color text such as `Blue to move`.
  - If the final-warning turn expires, the server treats the seat as abandoned by idle:
    - In 2-player Online PvP, the idle player loses and the opponent wins through `playerIdleAbandonedLoss`.
    - In 3-player and 4-player Online PvP, the idle seat becomes a permanent server bot through `playerIdleAbandonedBot`; ownership and the internal slot remain unchanged.
  - Idle abandonment is separate from disconnect/board-leave reconnect grace. Disconnects still use the 30-second reconnect timer.
  - If the server cannot find a legal timeout-assisted move, it advances safely to the next active player and emits `turnTimeoutNoMove`.
  - Late moves arriving after the server timer expires are rejected with `Turn timed out.` after the server has already resolved the timeout path. The client never decides or sends timeout moves.
  - Human vs Human and Human vs AI do not use this online timer.
- Bot turns do not run the normal human move timer. Permanent abandoned-seat bots use a slower 1700 ms delay only after the previous server `resolving` phase has finished and all required client animation acknowledgements or the fallback have completed, so bot-to-bot turns cannot outrun the browser animation queue.
- Permanent bot automation is guarded by `shouldAllowBotAutomation()`: the match must be `status: "playing"`, `phase: "playing"`, have no winner, have no active resolution timer, have no existing bot timer, current seat must be a permanent bot, and at least one active connected human plus at least two human-controlled seats must remain.
- Online PvP no longer allows invisible bot-only self-play. If all real human windows leave, the server clears bot/turn/resolution timers, pauses the match, keeps reconnect grace where applicable, and schedules cleanup.
- If 3-player or 4-player bot takeover would leave only one real human-controlled player, the remaining active human wins instead of watching bots play endlessly.
- If the Socket.IO client script cannot load because the online server is unavailable, the app shows a graceful lobby error and clears the cached load attempt so the user can start the server and retry.
- Each browser stores `chain-reaction-client-id`, and the last online match id is stored under `chain-reaction-online-match-id`.
- Online PvP now has match recovery instead of leaving users stuck on `You are already in a match`:
  - Pressing the game back button during an active online match emits `online:leaveMatchView`, returns to the setup/lobby screen, keeps the saved match id, starts the normal 30-second reconnect grace on the server, and shows `Rejoin Match`, `Forfeit Match`, and `Back`.
  - During Online PvP `resolving`/animation, the game back button remains enabled. Leaving the board increments the local animation token, clears queued move events, stops local timer display, and prevents remaining local playback from freezing the lobby.
  - Pressing setup `PLAY` while the same client is already in a playing match shows `You are already in a match. Rejoin or forfeit before searching again.`
  - `online:getActiveMatch` verifies saved matches before searching and returns `ACTIVE_MATCH_EXISTS`/recovery information when appropriate.
  - Rejoin uses `online:reconnectMatch` and restores the same color, board state, turn, players, and match id while the server still owns the match.
  - Manual forfeit uses `online:forfeitMatch` and clears the local saved match id so the player can search again.
- Active-match disconnect recovery:
  - When a player disconnects from a playing online match, closes/refreshes the page, or intentionally leaves the board view with the game back button, the server marks that player disconnected, clears the normal move timer if that seat is current, sets `disconnectedAt`, sets `graceExpiresAt` 30 seconds in the future, and includes a neutral `systemEvent` in snapshots.
  - Active gameplay disconnect text no longer prints countdown seconds; it uses the local visual color label, such as `Blue left - waiting`.
  - The reconnect countdown is shown through the black animated outline around the turn/status pill when the disconnected seat is current.
  - The online lobby/player list shows `Disconnected`, `Reconnecting`, `Bot`, and `Forfeited` badges where applicable.
  - If the player rejoins within 30 seconds, the server clears the timeout fields and includes a `playerRejoined` system event so clients render local text such as `Blue rejoined the match.` or `You rejoined the match.`
  - If a 2-player match times out, the disconnected player loses, the remaining player wins, `match.status` becomes `ended`, and the returning player receives `You lost by timeout.`
  - If a 3-player or 4-player match times out, the abandoned seat becomes a server bot that keeps the same color and board ownership. The original player cannot reclaim that seat after timeout.
  - In 3-player and 4-player matches, manual forfeit or post-grace timeout converts that seat to a bot only while at least two real human-controlled seats remain.
  - If a timeout/forfeit/idle abandonment would leave only one active real human, the server ends the match with `lastHumanWin` and clears bot/turn/resolution timers.
  - If every real human leaves the board view or disconnects, the server pauses the match with no bot self-play, clears bot/turn/resolution timers, keeps reconnect grace timers, and schedules cleanup.
  - Server bot turns go through the same authoritative `simulateAction()` move path as human online moves.

## UI Notes

The UI is designed as a compact game surface, not a landing page.

Important visible pieces:

- Intro title: `COLOR WARS`
- Subtitle: `Occupy the field with your color.`
- Large central play button.
- Setup bar with custom select controls.
- Game board with square cells.
- Floating turn badge.
- In active Online PvP, the floating turn badge can show a server-timed animated outline: white for the normal 20-second move timer, black for the 10-second final-warning timer, and black for the reconnect grace timer when the current seat is disconnected.
- During the server `tossing` phase, the Online PvP turn badge does not show or run the move timer. It starts displaying the white timer outline only after the server switches the match to `playing`.
- During the server `resolving` phase, the Online PvP turn badge does not show a move timer and must not fall back to stale `Red starts` / `Blue starts` toss text; it keeps active gameplay wording such as `Purple to move` or bot status text.
- Timeout-assisted server bot moves show short local text such as `You were idle. Bot made the move.` for the local idle player or `Purple was idle. Bot made the move.` for opponents, without usernames or generated ids. The inside of the turn badge briefly flashes black for about 700 ms.
- Score badges around the board.
- Toss overlay.
- Hold-to-options back button during active matches. In Online PvP it remains usable during resolving/animation so the player can leave/rejoin/forfeit instead of being trapped behind bot or chain playback.
- One-tap game-menu back button after a winner is declared.
- Settings icon button in the top-right of the setup/options screen, hidden from the initial front page.
- Settings panel with username, My Color, sound volume/mute controls, and the light/dark theme toggle.
- Online matchmaking/recovery panel with joined count, local seat-labeled matched players, status messages, Cancel/Back, Rejoin Match, and Forfeit Match actions.

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
- The settings overlay/card now handle scrolling internally because `body` is usually locked for the game shell:
  - `#settingsPanel` is a fixed full-screen flex overlay with safe-area padding and hidden overflow so the browser does not draw a large page-level scrollbar around the modal.
  - `.settings-card` is capped with `max-height: calc(100vh - 48px)` and `max-height: calc(100svh - 48px)`, has `overflow-y: auto`, `scrollbar-gutter: stable`, contained overscroll, and touch momentum scrolling.
  - `.settings-card` owns the visible scrollbar. It uses a thin rounded game-styled scrollbar through Firefox `scrollbar-width`/`scrollbar-color` and WebKit `::-webkit-scrollbar` rules, with a subtle slate/transparent track and soft cyan thumb.
  - `#settingsBackButton` is sticky at the top of the scrollable card so Settings can always be closed even when the card content is scrolled.
- The normal floating/global sound controls were removed from the main intro/setup/game UI; sound controls are only visible inside the settings panel.
- Keep the settings UI game-like and consistent with the existing rounded dark-panel style.

Username settings behavior:

- The settings panel includes `#usernameInput`, `#usernameSaveButton`, and `#usernameStatus`.
- Usernames are optional and saved in `localStorage` under `chain-reaction-username`.
- Empty saved usernames are cleared and the server may still keep generated fallback display names internally for compatibility/reconnect metadata.
- Valid usernames are trimmed, 3-16 characters, and may contain letters, numbers, spaces, underscores, and hyphens.
- Invalid usernames are not saved.
- Online queues/matches keep display names unique internally by adding a short suffix when needed, but Online PvP UI does not display those names or suffixes.

My Color settings behavior:

- The settings panel includes a `My Color` section with `#colorPicker` and `#colorValue`.
- Color choices are rendered as accessible button swatches from `PLAYER_COLOR_PALETTE`.
- The desktop/laptop color picker uses a compact 3-column grid inside the wider settings card. At smaller widths it switches to wrapping `auto-fit` columns so all 12 colors remain reachable through the settings card scroll area.
- The preference is saved in `localStorage` under `chain-reaction-player-color`.
- Red is the default. If the saved value is missing or invalid, `app.js` resets the preference to Red.
- This is a local visual preference only. It is not sent to the server and must not affect server validation, match ownership, reconnect identity, or security.
- In Human vs Human, Player 1 receives the saved preferred visual color and remaining local players receive non-conflicting palette colors.
- In Human vs AI, the human seat receives the saved preferred visual color even if the AI is configured as the first internal seat. The AI receives a different local visual color.
- Offline/internal player ids remain the stable four-slot ids from `PLAYER_POOL`; local player objects also carry visual names/colors for rendering.
- In Online PvP, every client builds its own local visual map:
  - local client seat -> saved preferred color
  - other seats -> non-conflicting palette colors
  - stored per match as `chain-reaction-online-visual-colors-{matchId}`
- Different clients may see the same server player using different colors. This is intentional because favorite color is private/local, not public identity.
- Rendering helpers separate internal ids from visuals:
  - `serverPlayerId` / `seatId`: internal ownership/validation id (`red`, `blue`, `green`, `amber`)
  - `visualColorId`: local display color from `PLAYER_COLOR_PALETTE`
  - `username`: optional internal profile setting, not shown in Online PvP
- Board orbs, transfer particles, burst effects, score cards, turn banner accent/background variables, toss chips/coin, and online lobby dots use `getVisualPlayerColor()` or the online visual map rather than hardcoded internal colors.

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
- The Sound settings section also has `#soundEnableButton` and `#soundStatus` for explicit mobile activation/testing.
- `#volumeValue` displays the current percentage, for example `Volume 100%`.
- `#soundStatus` shows small user-facing state text such as `Tap Enable Sound`, `Sound ready`, `Sound muted`, `Audio blocked by browser`, or `Audio not supported`.
- The buttons are icon/symbol-only, keyboard accessible, and `#soundToggle` uses `aria-pressed` to reflect muted state.
- `app.js` uses generated Web Audio API tones only; there are no external audio files.
- Sounds are intentionally soft, short, low-volume, and puzzle-game-like.
- Audio is not created or resumed until a real user gesture through the sound unlock listeners in `initializeSoundControls()`.
- Mobile audio unlock is resilient: pointer/touch/click/key listeners stay installed until the `AudioContext` is actually running, and they are re-armed after foregrounding if the browser suspends the context.
- Main PLAY, setup PLAY, board taps, restart, sound toggle, volume buttons, and `#soundEnableButton` all call the unlock path from their own user gesture.
- `#soundEnableButton` force-unmutes, creates/resumes Web Audio, and starts a short audible generated test chime from that same tap. Once audio is ready, the button text changes to `Test Sound`.
- The audio gesture guard separates non-audible unlock attempts from audible tests, so an earlier mobile `pointerdown`/`touchstart` unlock cannot suppress the explicit Enable/Test Sound confirmation click.
- Unmuting from Settings also attempts unlock/resume and starts the same short audible confirmation from that tap.
- If Web Audio is unsupported or blocked, app.js creates a tiny generated WAV data URL and uses an `HTMLAudioElement` fallback for simple tap/click-style sounds after the user activates it from a gesture.
- Audio diagnostics are available only when `localStorage.setItem("chain-reaction-audio-debug", "1")` is set. The debug log reports user agent, context state, mute/volume/gain, Web Audio unlock attempts, audible test starts, and HTMLAudio fallback play/reject results.
- If Web Audio and HTMLAudio are unsupported or blocked, the system reports that in Settings and gameplay continues.
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
  - `SOUND_MIN_VOLUME` is `0.3` and invalid, zero, or below-min saved values are reset to `SOUND_DEFAULT_VOLUME` on load.
  - Per-sound gains/durations are still short and gentle, but no longer near-inaudible.
  - `playGameSound()` now waits for `unlockAudio()` and retries once after the browser audio context starts, so sounds are not dropped while the context is resuming.
  - `unlockAudio()` includes a near-silent primer oscillator to improve mobile/browser audio startup reliability.
  - Toss spin audio uses a short repeating `tossSpin` sound with slight pitch motion and optional stereo panning. It starts immediately after `tossStart`, repeats every ~190 ms, and is stopped before `tossReveal` or whenever the toss overlay is hidden.
  - Toss spin was boosted after user feedback: primary spin tone gain is `0.075`, secondary tone gain is `0.038`.
  - Win audio is a warm generated success chime: a short rounded arpeggio with a soft major chord tail. Avoid high sparkly tones, bass hits, harsh effects, or arcade fanfares.

Game back button behavior:

- `#gameBackButton` uses hold-to-return behavior while a match is still active.
- During an active Online PvP match, returning to setup counts as leaving the online match view. The client keeps the saved match id, emits `online:leaveMatchView`, and the setup/online lobby shows Rejoin Match and Forfeit Match while the server reconnect grace runs.
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
- The settings card has its own viewport-bounded scroll area, so short laptop screens, tablets, and mobile viewports can reach the full My Color list plus lower settings such as Theme without relying on body scrolling.
- Mobile horizontal wobble is guarded in two layers:
  - `html`, `body`, `.app-shell`, and `.intro-panel` use full-width bounds, horizontal overflow clipping, and `overscroll-behavior-x: none`.
  - The overflowing content itself is constrained with safe viewport widths, `max-width: 100%`, and `min-width: 0` on flex/grid children.
- The setup/options panel `.settings-bar`, `.controls`, custom select buttons/menus, and `.setup-play-button` use `100dvw`/`100vw` safe widths so fixed padding and mobile browser viewport units do not push them wider than the screen.
- The Online PvP waiting/searching card `.online-lobby`, its header, player list, status text, and action buttons use safe widths, wrapping, and `min-width: 0` so joined-count/status content cannot widen the card on mobile.
- In setup view, the intro title area has mobile-safe side padding so the hold/back button remains visible without pushing `COLOR WARS` off-screen.
- Panels that should scroll vertically use `touch-action: pan-y`; avoid adding horizontal drag behavior to setup/lobby surfaces.

## How To Run

The game is static HTML/CSS/JS.

On Windows, the easiest run path is to double-click:

```text
run-color-wars.bat
```

That launcher starts the online Node server, opens:

```text
http://127.0.0.1:5522/index.html
```

Keep the launcher console window open while playing. Close it or press `Ctrl+C` to stop the local server.

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

- Mobile 7x7 centered-grid sizing verification after the June 8, 2026 correction:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Static formula checks for portrait mobile sizes now center the real 7x7 grid inside the viewport with equal side gaps: `333px` grid / `45px` cells / `13.5px` side gaps at `360x740`, `361px` / `49px` / `14.5px` at `390x760`, `368px` / `50px` / `12.5px` at `393x760`, `388px` / `52px` / `12px` at `412x800`, `402px` / `54px` / `14px` at `430x880`, and `548px` / `74px` / `12.5px` at `573x930` or `573x1010`.
  - Static formula checks also confirmed short mobile heights cap the board by available height instead of overflowing horizontally; at `360x548`, the board is height-limited to `305px` rather than clipping sideways.
  - Mobile 7x7 `.board-frame` padding/border/shadow were removed so the visible frame cannot push the grid right or add hidden width outside the centered board shell.
  - Static source checks confirmed the correction is limited to stable responsive board sizing, active game overflow behavior, cache busting, and documentation. Gameplay rules, board presets, server validation, bot logic, animation style, sound, theme, and Online PvP authority were not changed.
  - Local HTTP checks confirmed `http://127.0.0.1:5522/health` returns `{"ok":true}` and `http://127.0.0.1:5522/index.html` returns HTTP `200`.
  - Local HTTP checks confirmed the new `20260608-mobile-7x7-centered-grid` CSS and JS cache-busted assets return HTTP `200`.
  - In-app Browser verification was attempted, but the local browser runtime failed before opening the page; this run exited with `windows sandbox failed: spawn setup refresh`. Static sizing and local HTTP checks were used as fallback verification.
- Timing-only animation slowdown verification after the June 7, 2026 update:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Static source checks confirmed no new `.is-priming`, `.is-exploding`, `cell-prime`, `orb-prime`, `cell-explode`, or `orb-explode` animation classes/keyframes were introduced.
  - Static source checks confirmed the original transform/easing values are still present for `orb-pop`, `overload`, `cell-ring`, and `burst-wave`; only durations/waits changed.
  - Local HTTP `http://127.0.0.1:5522/index.html` served the new `20260607-timing-slowdown` cache-busted assets.
  - In-app Browser verification was attempted, but the local browser runtime failed before opening the page with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`.
- Online PvP repeated-idle final-warning verification after the June 6, 2026 update:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Direct `MatchmakingStore` idle rule assertions passed:
    - First and second idle expiries produce timeout-assisted bot moves and increment `idleTimeoutCount`.
    - The player remains a human seat after the first two idle expiries.
    - The next turn after two consecutive idle expiries uses `turnTimerMode: "finalWarning"` and `ONLINE_FINAL_WARNING_TIME_MS`.
    - Expiring the final warning in a 2-player match sets `playerIdleAbandonedLoss`, marks the idle player forfeited/abandoned, and declares the opponent winner.
    - Expiring the final warning in a 3-player match sets `playerIdleAbandonedBot`, marks the idle player abandoned, and converts that seat into a permanent bot.
    - A manual legal move after one idle expiry resets `idleTimeoutCount` back to `0`.
  - Static source checks confirmed `app.js` reads `turnTimerMode`, uses a black outline for `finalWarning`, and uses `timeout-bot-flash` for timeout-assisted bot moves.
  - In-app Browser verification was attempted against `http://127.0.0.1:5522/index.html`, but the local browser runtime failed before opening the page with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`.
- Online PvP first-turn unlock verification after the June 6, 2026 fix:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Direct `MatchmakingStore` first-turn phase assertion passed:
    - A first move during `phase: "tossing"` is rejected with `Match is starting.`
    - After `startPlayingPhase()`, the toss winner can immediately place on an empty cell before the turn timer expires.
  - Static source checks confirmed `app.js` now has `isOnlineLocalPlayersTurn()`, refreshes board interactivity after the `tossing` to `playing` transition, and fetches a fresh active-match snapshot after toss if the playing update has not been applied yet.
  - The in-app Browser smoke test was attempted against `http://127.0.0.1:5522/index.html`, but the local browser runtime failed before opening the page with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. The process launched by this turn was stopped; the health endpoint still responded afterward, indicating another server was already using port `5522`.
- Online PvP timeout-assisted bot and board-leave verification after the June 6, 2026 update:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Direct `MatchmakingStore` timeout/leave assertions passed:
    - New online matches start in `phase: "tossing"` with `turnStartedAt` and `turnExpiresAt` set to `null`.
    - `startPlayingPhase()` switches the match to `phase: "playing"` and starts the first server turn timer.
    - Forced expired turns trigger one timeout-assisted bot move with `timeoutMove: true` and `systemEvent.type === "turnTimeoutBotMove"`.
    - The timed-out player remains a human seat and is not marked `isBot` or `replacedByBot`.
    - Late human moves after expiry are rejected with `Turn timed out.` and emit the timeout bot move exactly once.
    - `markLeftMatchView()` marks the leaving player disconnected, sets `leaveReason: "leaveMatchView"`, starts reconnect grace, and clears the current move timer when that player was current.
    - 3-player post-grace abandonment still converts the disconnected seat into a permanent bot while the match continues.
  - A temporary Node server responded successfully at `http://127.0.0.1:5522/health`.
  - In-app Browser verification was attempted, but the local browser runtime failed before opening the page with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. The temporary server was stopped afterward.

The following checks were run successfully:

- Online bot pacing/lifecycle verification after the June 6, 2026 ack-gated resolving update:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Direct `MatchmakingStore` assertions confirmed a legal online move enters `phase: "resolving"`, records expected animation acknowledgements for connected human clients, does not finish resolving after only one ack, and returns to `playing` after all expected acknowledgements and the safe minimum delay.
  - Direct `MatchmakingStore` assertions confirmed a permanent bot schedules only when at least two real human-controlled seats remain, and a second bot takeover in a 3-player match ends with the remaining active human as winner instead of scheduling bot self-play.
  - Direct `MatchmakingStore` assertions confirmed closing/leaving all active human seats pauses the match and clears bot, turn, and resolution timers.
  - Static source assertions confirmed `online:animationComplete` is wired in `server/index.js`, `server/matchmaking.js` has ack tracking plus strict bot automation guards, and `app.js` emits animation completion only after queued playback finishes while using `try/finally` to clear resolving/moving state.
  - Local HTTP response from `http://127.0.0.1:5522/index.html` contained the current `app.js?v=20260606-bot-pacing` cache-busted asset.
- Mobile sound activation verification after the June 6, 2026 explicit Enable/Test Sound update:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Static source checks confirmed `#soundEnableButton` and `#soundStatus` exist, `unlockAudioFromGesture({ audibleTest: true })` starts a real Web Audio test tone from the settings tap, duplicate pointer/click guards do not suppress the explicit audible test, unmute uses the audible activation path, invalid/zero/below-min saved volume resets to default, and an `HTMLAudioElement` generated-WAV fallback exists for simple sounds if Web Audio remains blocked.
  - Local HTTP response from `http://127.0.0.1:5522/index.html` contained the current `styles.css?v=20260606-mobile-sound` and `app.js?v=20260606-mobile-sound` cache-busted assets.
  - Real mobile-browser audible verification still needs to be performed on a phone through the LAN URL because this environment cannot hear device audio.
- Mobile browser polish verification after the June 6, 2026 mobile overflow/audio update:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Static CSS assertions confirmed document/shell horizontal overflow clipping, horizontal overscroll protection, vertical-only touch panning on setup/lobby surfaces, safe `100dvw` setup/lobby/play widths, wrapped Online PvP lobby text/actions, and no broad `body { overflow: auto }` regression.
  - Static app assertions confirmed the mobile audio unlock path installs `pointerdown`, `touchstart`, `click`, and `keydown` retry listeners, re-arms after visibility foregrounding, runs from PLAY/setup PLAY/board taps/sound controls, and keeps layout overflow diagnostics disabled by default.
  - Local HTTP response from `http://127.0.0.1:5522/index.html` contained the current `styles.css?v=20260606-mobile-polish` and `app.js?v=20260606-mobile-polish` cache-busted assets.
  - In-app Browser visual verification was attempted, but the local browser runtime failed before opening the page with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. Syntax/static checks and the local HTTP cache-bust check were used as the reliable fallback.
- Online local turn text verification after the June 6, 2026 `Your turn` UI update:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Static code review confirmed active Online PvP turn text now goes through `formatOnlineTurnText()`, which uses local `clientId`/seat mapping to return `Your turn` only on the local player's own browser.
  - Static code review confirmed opponent turn labels still use the local visual color, toss text uses `You start` only for the local starter, and timeout-assisted bot messages use `You were idle...` only for the local idle player.
- Online resolving/queue update verification after the June 6, 2026 bot pacing fix:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Direct `MatchmakingStore` assertions confirmed a legal human move switches the match to `phase: "resolving"`, clears the turn timer, increments revision, and rejects the next human move with `Move is resolving.` until `finishMoveResolution()` returns the match to `playing`.
  - Direct `MatchmakingStore` assertions confirmed timeout-assisted bot moves now enter `resolving` with no active turn timer, and the next timer starts only after resolution finishes.
  - Direct `MatchmakingStore` assertions confirmed permanent bot moves do not chain during `resolving`; the next permanent bot is scheduled only after the previous move resolution finishes.
  - Static client assertions confirmed `online:moveApplied` uses `enqueueOnlineMoveApplied()`, the client has a serialized move queue, pending match updates, revision guards, playback cancellation, timer suppression during resolving/processing, and an enabled Online PvP back button during resolving.
  - A temporary current-code server was started successfully on `http://127.0.0.1:5523` and `/health` returned 200, then it was stopped.
  - The in-app Browser plugin was attempted for a local visual smoke test, but the local browser runtime failed before opening the page with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. Store/static/syntax checks were used as the reliable fallback.
- `node --check app.js`
- `node --check js\engine.js`
- `node --check js\ai.js`
- `node --check js\player-model.js`
- `node --check server\index.js`
- `node --check server\matchmaking.js`
- `node --check server\validation.js`
- `node --check server\bot.js`
- `npm install` in `server/` completed successfully and installed Express/Socket.IO with no vulnerabilities reported.
- Online recovery syntax and server checks after the abandoned-match recovery update:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Direct matchmaking-store recovery test passed:
    - 2-player disconnect marks the player disconnected and sets a grace expiry.
    - Reconnect within grace restores the player.
    - Forced post-grace timeout ends the 2-player match and awards the opponent.
    - Returning after timeout receives `MATCH_TIMEOUT_LOSS` and can queue again.
    - 3-player timeout replaces the disconnected seat with a bot.
    - The server bot makes a legal move when its color is current.
    - Late reclaim after bot replacement is rejected with `SEAT_REPLACED`.
    - 4-player manual forfeit converts the forfeited seat to a bot.
  - Self-contained live Socket.IO recovery integration test passed against a child `server/index.js` process:
    - 2-player match started through `online:joinQueue`.
    - Closing one client broadcast a left-match system message with a 30-second grace timestamp.
    - `online:getActiveMatch` and `online:reconnectMatch` restored the same seat.
    - A second disconnect timed out after the real 30-second grace.
    - Remaining player received a server win.
    - Returning abandoned player received `MATCH_TIMEOUT_LOSS`, cleared stale match state, and could search again.
  - The in-app Browser plugin was attempted for visual UI testing but the session had no active Codex browser pane; launching headless Chrome was blocked by the local sandbox. Socket.IO integration and syntax/store tests were used as the reliable automated fallback.
- Online color-only gameplay label verification after the June 5, 2026 label update:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Focused text search confirmed the active gameplay waiting label uses `Waiting for ${currentColorName}`.
  - Direct `MatchmakingStore` assertions confirmed disconnect/rejoin/timeout server messages used the then-current color-only text and did not include usernames or fallback ids.
- Online color-only public label verification after the broader Online PvP display update:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Static assertion confirmed `app.js` no longer rendered `player.displayName` in the Online PvP UI and used the then-current color-only public labels.
  - Direct `MatchmakingStore` assertions with duplicate usernames confirmed disconnect, rejoin, 2-player timeout, and 3-player bot takeover messages stay color-only.
  - Direct assertions confirmed bot replacement uses internal `Green Bot` style metadata while public client rows still render just `Green` plus a `Bot` badge.
  - The in-app Browser plugin was attempted for a local lobby smoke check, but the session failed before opening the page with a local browser-runtime asset path error. Syntax and store/static assertions were used as the reliable fallback.
- My Color preference verification after the local visual color update:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Focused static assertions confirmed `PLAYER_COLOR_PALETTE` contains Red, Blue, Green, Amber, Purple, Pink, Cyan, Orange, Lime, Teal, Violet, and Rose.
  - Focused static assertions confirmed the client has `chain-reaction-player-color`, `chain-reaction-online-visual-colors-{matchId}`, `getVisualPlayerColor()`, and does not include the favorite color in `getOnlineIdentityPayload()`.
  - Direct `MatchmakingStore` assertions confirmed disconnect, rejoin, 2-player timeout, and 3-player bot takeover snapshots carry neutral `systemEvent` metadata instead of public internal color-name messages.
  - A temporary Node server was started with the explicit Node executable path and confirmed listening on `127.0.0.1:5522`, but the in-app Browser plugin still failed before opening the page with a local browser-runtime asset path error. The temporary process exited before cleanup and no listener remained on port `5522`.
- Settings scroll/layout verification after the My Color height fix:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Static CSS assertions confirmed `#settingsPanel` and `.settings-card` have internal scrolling, `.settings-card` has viewport max-height rules for `100vh`/`100svh`, `#settingsBackButton` is sticky, and `.color-picker` has desktop and small-screen responsive grids.
  - In-app Browser verification was attempted again for a visual smoke test, but the local browser runtime still failed before opening the page with the same asset path error. Static layout assertions and syntax checks were used as the reliable fallback.
- Settings scrollbar styling verification:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Static CSS assertions confirmed `#settingsPanel` uses hidden overflow to avoid a page-level default scrollbar, while `.settings-card` keeps `overflow-y: auto` and owns thin custom Firefox/WebKit scrollbar styling.
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
  - 3-player matchmaking showed `1/3`, then `2/3` with matched players, and auto-started at `3/3`.
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
  - Duplicate usernames were made unique internally inside the queue.
  - Fallback color/code names were generated internally when username was empty.
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
- Navigation and Online PvP cancel-state verification after the setup/back cleanup:
  - `node --check app.js`
  - `node --check js\engine.js`
  - `node --check js\ai.js`
  - `node --check js\player-model.js`
  - `node --check server\index.js`
  - `node --check server\matchmaking.js`
  - `node --check server\validation.js`
  - `node --check server\bot.js`
  - Static review confirmed the setup/front-page back button now uses `showIntroScreen()` instead of only removing `setup-open`.
  - Static review confirmed Online PvP Cancel clears local matchmaking state before awaiting `online:cancelQueue`, so `Players`, `Board`, and mode controls unlock immediately.
  - Static review confirmed failed `online:joinQueue` responses also clear `onlineState.matchmaking`, preventing a stuck disabled Players dropdown after server unavailable/error states.
  - Static review confirmed `renderOnlineLobby()` now requires `body.setup-open`, so async recovery/cancel callbacks cannot re-open the Online PvP lobby on the front page.
  - Static review confirmed `online:queueUpdate` is ignored once local matchmaking has been cleared, preventing late queue updates from re-locking controls.

## Known Issues / Things To Watch

- `index.html` title says `Chain Reaction`, while the visible game brand says `COLOR WARS`.
- `getCapacity()` always returns `4`; confirm whether this is intentional.
- `app.js` is the browser-loaded file. If editing modular files in `js/`, mirror gameplay changes into `app.js` or add a build step.
- `server/validation.js` mirrors the engine rules for online server authority. If gameplay rules change, update the browser engine and server validation together.
- Online queues and matches are in memory only. Restarting the Node server clears waiting queues and active matches.
- Reconnect/recovery is client-id/match-id based and has no account system or persistence across a Node server restart.
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
