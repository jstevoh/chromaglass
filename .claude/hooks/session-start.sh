#!/bin/bash
# Cloud sessions start from a fresh clone with no node_modules, so no check
# can run until this has. Chromium needs nothing here: scripts/chromium.mjs
# already finds the container's /opt/pw-browsers/chromium.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
# install rather than ci: it reuses a cached node_modules instead of deleting it.
npm install --no-audit --no-fund
