@echo off
rem Double-click to start 1xOdds on Windows.
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js isn't installed yet. Opening nodejs.org - install the LTS version, then double-click this file again.
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing ^(1-2 minutes^)...
  call npm install
  if errorlevel 1 ( echo Install failed. Copy this window's text and send it to Claude. & pause & exit /b 1 )
)
echo.
echo Checking your odds feed...
call npm run --silent probe:sgo NHL
echo.
echo Starting 1xOdds. Keep this window open while you use it. Close it to stop.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:5173"
call npm run dev
