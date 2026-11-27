#!/usr/bin/env bash
# The parity run's nightly job on the owner's Mac (PLAN.md 50i, `npm run parity`).
#
# launchd starts this at 11:30 PM local from the parity clone
# (~/cg-scratch/parity/clone), after moving that clone to origin/main, so the
# job never touches the checkout a session works in, and this script is always
# main's own (`npm run parity -- install-agent` writes the agent). It brings the
# clone's packages up to main's lock when the lock changed, then runs the
# comparison: last night's main against tonight's. Every piece of the sweep
# queues on the Mac's film lock and waits out a deploy (scripts/maclock.mjs),
# so nothing here takes the Mac from a deploy or a film. It never records a
# film: the sweep reads frames as numbers and the parity run never asks the bug
# bash for its film part.
#
# Off switch: `rm ~/cg-scratch/parity/LIVE` (the job then exits at once), or
# `npm run parity -- uninstall-agent`.
set -euo pipefail
HERE="$HOME/cg-scratch/parity"
mkdir -p "$HERE"
echo "── $(date '+%Y-%m-%d %H:%M %Z') parity nightly at $(git rev-parse --short HEAD)"
if [ ! -e "$HERE/LIVE" ]; then echo "   $HERE/LIVE is not there: off"; exit 0; fi
# The battery: a sweep on battery runs the GPU slower and drains the Air overnight.
if command -v pmset >/dev/null && pmset -g batt | grep -q "'Battery Power'"; then echo "   on battery: skipped tonight"; exit 0; fi
if ! cmp -s package-lock.json node_modules/.parity-lock 2>/dev/null; then
  npm ci --no-audit --no-fund --loglevel=error
  cp package-lock.json node_modules/.parity-lock
fi
# caffeinate keeps the Mac awake while the run lasts (the lid shut on power still sleeps without it).
exec caffeinate -i npm run parity -- --nightly
