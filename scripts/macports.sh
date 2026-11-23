#!/usr/bin/env bash
# Wait until no process on this Mac listens on a harness's port (PLAN.md 19ah).
#
# The owner's Mac is a self-hosted runner for main's deploys, and it is also
# where sessions run the harnesses by hand. Every harness serves the built app
# on its own port with `--strictPort`, no fallback to another, so a shard
# started while something holds that port either fails to listen and goes red
# with nothing wrong in the commit, or, for a harness that only connects,
# measures the other run's server and whatever code that is. A GitHub Mac is
# a fresh machine and never meets this, which is why only the self-hosted
# shards run it.
#
# Since 19ah-6 each runner on the Mac has a block of ports of its own
# (HARNESS_PORT_SHIFT in its .env, scripts/ports.mjs), and a session by hand
# has the unshifted block, so what this still waits for is a run in this
# runner's own block: a cancelled job's `vite preview` that outlived it. The
# list is scripts/ports.mjs's, read from scripts/ each time, so a new
# harness's port is waited for without anyone remembering this file. Waits up
# to $1 seconds (default 600), checking every 15, then fails naming the
# process that holds each port, so the red line says whose run to stop.
#
#   bash scripts/macports.sh [seconds]
set -euo pipefail
cd "$(dirname "$0")/.."
limit="${1:-600}"
ports=$(node scripts/ports.mjs --list)
[ -n "$ports" ] || { echo "::error title=Harness ports::scripts/ports.mjs listed no harness port; its pattern no longer matches how harnesses ask for theirs"; exit 1; }
echo "this runner's block: HARNESS_PORT_SHIFT=${HARNESS_PORT_SHIFT:-0}"
held() { lsof -nP -iTCP:"$ports" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true; }
waited=0
while :; do
  now=$(held)
  [ -z "$now" ] && { echo "harness ports free ($ports) after ${waited}s"; exit 0; }
  if [ "$waited" -ge "$limit" ]; then
    echo "::error title=Harness ports held::after ${waited}s something on the owner's Mac still listens on a harness's port (listed below); stop that run and re-run this job"
    echo "$now"
    exit 1
  fi
  [ "$waited" -eq 0 ] && { echo "waiting for the harness ports to close:"; echo "$now"; }
  sleep 15
  waited=$((waited + 15))
done
