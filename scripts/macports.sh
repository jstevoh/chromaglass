#!/usr/bin/env bash
# Wait until no process on this Mac listens on a harness's port (PLAN.md 19ah).
#
# The owner's Mac is a self-hosted runner for main's deploys, and it is also
# where sessions run the harnesses by hand. Most harnesses serve the built app
# on a fixed port (`const PORT = 4341;` and the like in scripts/), with no
# fallback to another, so a shard started while a session's `magnet` holds
# 4341 either fails to listen and goes red with nothing wrong in the commit,
# or, for a harness that only connects, measures the session's server and
# whatever code that is. A GitHub Mac is a fresh machine and never meets this,
# which is why only the self-hosted shards run it.
#
# The ports are read from scripts/ each time rather than listed here, so a new
# harness's port is waited for without anyone remembering this file. Waits up
# to $1 seconds (default 600), checking every 15, then fails naming the
# process that holds each port, so the red line says whose run to stop.
#
#   bash scripts/macports.sh [seconds]
set -euo pipefail
cd "$(dirname "$0")/.."
limit="${1:-600}"
ports=$(grep -ohE '\b[A-Z_]*PORT = [0-9]{4,5}' scripts/*.mjs | grep -oE '[0-9]+$' | sort -un | paste -sd, -)
[ -n "$ports" ] || { echo "::error title=Harness ports::found no fixed port in scripts/*.mjs; the pattern here no longer matches how harnesses name their port"; exit 1; }
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
