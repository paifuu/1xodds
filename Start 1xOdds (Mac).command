#!/bin/bash
# Double-click to start 1xOdds on a Mac.
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js isn't installed yet. Opening nodejs.org — install the LTS version, then double-click this file again."
  open "https://nodejs.org"
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "First run: installing (1-2 minutes)…"
  npm install || { echo "Install failed. Copy this window's text and send it to Claude."; read -n 1 -s -r; exit 1; }
fi
echo ""
echo "Checking your odds feed…"
npm run --silent probe:sgo NHL | head -40
echo ""
echo "Starting 1xOdds. Keep this window open while you use it. Close it to stop."
( sleep 6; open "http://localhost:5173" ) &
npm run dev
