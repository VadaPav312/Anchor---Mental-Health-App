#!/usr/bin/env bash
# Anchor bridge — DEMO mode: smooth fake data, no Arduino. Single instance.
cd "$(dirname "$0")/.." || exit 1
pkill -f "node server.js" 2>/dev/null && sleep 1
exec env ANCHOR_FAKE=1 node server.js
