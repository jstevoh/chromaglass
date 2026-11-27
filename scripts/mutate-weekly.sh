#!/usr/bin/env bash
# The weekly mutation run on the owner's Mac (PLAN.md 50i), as launchd starts
# it (scripts/mutate-install.sh puts a copy of this at
# ~/cg-scratch/bin/mutate-weekly.sh and the job beside it).
#
# Always main's latest, whatever branch the owner's checkout is on: the tree
# (scripts/mutate-tree.sh) is made from origin/main's own copy of the script,
# and the run is that tree's scripts/mutate.mjs. Through the film queue, never
# a hand-written film.lock (scripts/maclock.mjs): its lab checks drive Chromium
# on the Mac's GPU, and one film at a time is the owner's rule (2026-11-22).
# The lock is held for the whole run, at most six hours (sixteen faults at twenty minutes each, the worst case); the checks inside
# nest under it (CG_FILM_LOCK_HELD), and a deploy's hold on the Mac still
# comes first (scripts/macdeploy.mjs, which launchChromium waits for).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
repo=${CG_REPO:-$HOME/chromaglass}
tree=${CG_MUTATE_TREE:-$HOME/cg-scratch/mutate/tree}
out=${CG_MUTATE_OUT:-$HOME/cg-scratch/mutate}
mkdir -p "$out"
git -C "$repo" fetch -q origin main
git -C "$repo" show origin/main:scripts/mutate-tree.sh | bash -s "$repo" "$tree" origin/main
cd "$tree"
exec node "$HOME/cg-scratch/bin/maclock.mjs" run --label "mutation run (weekly)" --timeout 21600 -- \
  node scripts/mutate.mjs --here --out "$out" --minutes 20
