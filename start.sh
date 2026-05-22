#!/bin/bash
# Start DocPeer if not already running
if ! lsof -ti:3500 > /dev/null 2>&1; then
  cd "$(dirname "$0")"
  npm run dev > /tmp/docpeer.log 2>&1 &
  sleep 3
  echo "[docpeer] Started at http://localhost:5180"
else
  echo "[docpeer] Already running at http://localhost:5180"
fi
