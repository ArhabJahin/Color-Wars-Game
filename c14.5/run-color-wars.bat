@echo off
setlocal

title Color Wars - Local Server
cd /d "%~dp0"

set "GAME_URL=http://127.0.0.1:5522/index.html"
set "SERVER_DIR=%~dp0server"

if /I "%~1"=="--check" (
  if not exist "%SERVER_DIR%\index.js" (
    echo Missing server\index.js
    exit /b 1
  )
  where node >nul 2>&1
  if errorlevel 1 (
    echo Node.js was not found in PATH.
    exit /b 1
  )
  echo Launcher check passed.
  exit /b 0
)

echo Starting Color Wars...
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Install Node.js, then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "%SERVER_DIR%\index.js" (
  echo Could not find server\index.js.
  echo Make sure this launcher is inside the Color Wars project folder.
  echo.
  pause
  exit /b 1
)

if not exist "%SERVER_DIR%\node_modules" (
  echo Installing server dependencies...
  pushd "%SERVER_DIR%"
  call npm install
  if errorlevel 1 (
    popd
    echo.
    echo npm install failed. Check your network connection and try again.
    pause
    exit /b 1
  )
  popd
  echo.
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalPort 5522 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($listener) { exit 0 } exit 1" >nul 2>&1
if "%errorlevel%"=="0" (
  echo A Color Wars server appears to already be running on port 5522.
  echo Opening %GAME_URL%
  start "" "%GAME_URL%"
  echo.
  echo You can close this window.
  pause
  exit /b 0
)

echo Opening %GAME_URL%
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process '%GAME_URL%'"

echo.
echo Server is running. Keep this window open while playing.
echo Press Ctrl+C to stop the server.
echo.

pushd "%SERVER_DIR%"
node index.js
set "EXIT_CODE=%errorlevel%"
popd

echo.
echo Server stopped.
pause
exit /b %EXIT_CODE%
