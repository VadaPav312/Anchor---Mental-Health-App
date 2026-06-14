#!/usr/bin/env bash
# Anchor bridge — guaranteed single-instance restart.
# Kills any server already holding the USB serial port, then starts exactly one.
# (Two copies fighting over the port is what caused the "link lost" flapping.)
cd "$(dirname "$0")/.." || exit 1
pkill -f "node server.js" 2>/dev/null && sleep 1
exec node server.js
