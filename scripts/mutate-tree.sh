#!/usr/bin/env bash
# The mutation run's own checkout (PLAN.md 50i): a git worktree of <repo> at
# <ref>, with its own node_modules, that scripts/mutate.mjs puts faults into
# one at a time. Its own tree, not the owner's checkout: a fault written into
# a checkout someone is working in, or a bundle built from it into a shared
# node_modules/.cache, could reach a session that is not the mutation run.
#
#   bash scripts/mutate-tree.sh <repo> <tree> <ref>
#
# Kept between runs, so the weekly run pays `npm ci` only when package-lock
# changed. Everything in <tree> that git does not track is the run's own and
# is cleaned, apart from node_modules.
set -euo pipefail
repo=$1 tree=$2 ref=$3
if git -C "$tree" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$tree" checkout -q --detach -f "$ref"
  git -C "$tree" clean -fdxq -e node_modules
else
  git -C "$repo" worktree prune
  mkdir -p "$(dirname "$tree")"
  git -C "$repo" worktree add -q --detach "$tree" "$ref"
fi
want=$(git -C "$tree" rev-parse HEAD:package-lock.json)
have=$(cat "$tree/node_modules/.mutate-lock" 2>/dev/null || true)
if [ "$want" != "$have" ]; then
  (cd "$tree" && npm ci --no-audit --no-fund --loglevel=error)
  echo "$want" > "$tree/node_modules/.mutate-lock"
fi
echo "mutation tree $tree at $(git -C "$tree" rev-parse --short HEAD)"
