#!/usr/bin/env bash
# Has this exact tree already passed the checks? `deploy.yml` asks this before
# running `checks.yml` again on a push to main.
#
# What was reported (2026-09-27): "so many of my GitHub CIs are failing, it
# wastes so much time." What was measured, over the 100 runs from 1 AM to
# 11 AM PT that day: 18 red, 5 of them deploys out of 16. Every deploy re-ran
# all four macOS shards on main. 11 of the last 15 merges deployed a tree
# identical, file for file, to the head that had just gone green on its PR, and
# 3 of the 5 red deploys (#189, #195, #196) were that same tree going red the
# second time, on checks nothing in those PRs touched: a show night with no
# WebGPU adapter, Beat Squeeze's clock and the ear, the wall's output gain. Each held every merge behind it until someone
# re-ran it by hand, and each doubled the load on the Mac runners, which is
# why a run that took 10 minutes at 1 AM took 20 to 55 by noon.
#
# Re-measuring an identical tree cannot find a bug the first measurement
# missed; all it can find is a flaky check, and the place for that is the
# check's own fix (PLAN.md §0), not a deploy held up behind it. So the deploy
# trusts a green PR run when, and only when, the code it would publish is the
# code that run measured:
#
#   1. the pushed commit came from a merged PR (a squash names one);
#   2. a `Checks` run for the pull_request event on that PR's head concluded
#      success (every shard: a run's conclusion is its worst job's);
#   3. the commit that run tested has the same git tree as the pushed commit.
#      A pull_request run tests GitHub's merge of the head into its base, and
#      `checks.yml` writes that merge's SHA into the run's title, so this is
#      the same tree read directly, not inferred. It closes the case a head
#      rule cannot see: a stacked PR moved onto main after its only run, which
#      tested the head merged into another branch.
#
# Runs from before the title carried the tested SHA (before 2026-09-27) fall
# back to inferring it: the head has the pushed tree, and main as it stood
# before the push ($2 in CI, `github.event.before`; the commit's parent in a
# replay) is an ancestor of the head. main only moves forward, so every main
# the run could have merged into was already inside the head, and the test
# merge was the head's own tree. Using the push's `before`, not the commit's
# parent, is what makes a force-push of a stale head onto main read as
# "diverged" and so false.
#
# Anything else (a head that was behind main, a direct push, a failed or
# missing PR run, a tested merge that cannot be read) runs the checks in full,
# exactly as before.
#
# Usage:
#   scripts/deploygate.sh <sha> [<main before the push>]
#                                        prints tested=true|false and why;
#                                        appends tested=… to $GITHUB_OUTPUT if set
#   scripts/deploygate.sh --history <n>  replays the last n merges on main and
#                                        counts how many would have skipped
#   (`npm run deploygate -- --history 20`)
#
# Needs curl and jq. Uses $GH_TOKEN when set (CI). The repository is public, so
# it runs unauthenticated too, but a replay makes about six calls a merge
# against an hourly limit of 60 without a token: GH_TOKEN=$(gh auth token).
set -euo pipefail
# Without this an API error inside $(…) is swallowed and reads as an empty
# tree, which would say "false" for the wrong reason instead of failing (and a
# failed gate in deploy.yml runs the checks, which is the safe way to be wrong).
# Bash before 4.4 (macOS's own 3.2) has no such option; there the calls below
# are also checked by hand where it matters (an empty tree is never a match).
shopt -s inherit_errexit 2>/dev/null || true

REPO="${GITHUB_REPOSITORY:-jstevoh/chromaglass}"
API="https://api.github.com/repos/$REPO"

api() {
  local auth=()
  [ -n "${GH_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $GH_TOKEN")
  # ${auth[@]+…}: an empty array is "unbound" under set -u before bash 4.4.
  curl -fsSL --retry 3 --retry-delay 2 ${auth[@]+"${auth[@]}"} \
    -H 'Accept: application/vnd.github+json' "$API/$1"
}

treeof() { api "git/commits/$1" | jq -r '.tree.sha // empty'; }

# Echoes "true <why>" or "false <why>" for one commit on main; $2 is main
# before it (defaults to the commit's first parent, which for a squash merge
# is the same commit).
judge() {
  local sha="$1" before="${2:-}" commit tree heads entry pr head runs run url tested ttree htree status
  commit=$(api "commits/$sha")
  sha=$(jq -r .sha <<<"$commit")
  tree=$(jq -r '.commit.tree.sha // empty' <<<"$commit")
  [ -n "$tree" ] || { echo "false could not read the pushed commit's tree"; return; }
  [ -n "$before" ] || before=$(jq -r '.parents[0].sha // empty' <<<"$commit")
  heads=$(api "commits/$sha/pulls" | jq -r '.[] | select(.merged_at != null) | "\(.number):\(.head.sha)"')
  [ -n "$heads" ] || { echo "false not the merge of a PR"; return; }
  for entry in $heads; do
    pr="${entry%%:*}"; head="${entry##*:}"
    runs=$(api "actions/workflows/checks.yml/runs?head_sha=$head&event=pull_request&status=success&per_page=10" \
      | jq -r '.workflow_runs[] | "\(.html_url) \(.display_title | capture("\\(tests (?<s>[0-9a-f]{40})\\)$").s // "-")"')
    if [ -z "$runs" ]; then
      echo "false #$pr's head ${head:0:7} has no green Checks run"; continue
    fi
    while read -r url tested; do
      if [ "$tested" != - ]; then
        ttree=$(treeof "$tested")
        if [ -n "$ttree" ] && [ "$ttree" = "$tree" ]; then
          echo "true #$pr's run tested ${tested:0:7}, the tree being deployed, and passed: $url"; return
        fi
        echo "false #$pr's run $url tested ${tested:0:7}, not the tree being deployed"
        continue
      fi
      htree=$(treeof "$head")
      if [ -z "$htree" ] || [ "$htree" != "$tree" ]; then
        echo "false #$pr's head ${head:0:7} is not the tree being deployed"; continue
      fi
      [ -n "$before" ] || { echo "false no main before the push to compare with"; continue; }
      # compare/<base>...<head> is "ahead" or "identical" exactly when base is
      # an ancestor of head.
      status=$(api "compare/$before...$head" | jq -r .status)
      if [ "$status" != ahead ] && [ "$status" != identical ]; then
        echo "false #$pr's head ${head:0:7} was $status of main ${before:0:7}"; continue
      fi
      echo "true #$pr's head ${head:0:7} is this tree, contains main ${before:0:7}, and passed: $url"; return
    done <<<"$runs"
  done
  echo "false no green run of this tree"
}

if [ "${1:-}" = --history ]; then
  n="${2:-20}"; yes=0; total=0
  # Read first, so a failed call stops the script instead of replaying nothing.
  list=$(api "commits?sha=main&per_page=$n" | jq -r '.[] | "\(.sha) \(.commit.message | split("\n")[0])"')
  [ -n "$list" ] || { echo "no commits on main to replay" >&2; exit 1; }
  while read -r sha subject; do
    verdict=$(judge "$sha" | tail -1)
    total=$((total + 1)); [ "${verdict%% *}" = true ] && yes=$((yes + 1))
    printf '%s %-60.60s %s\n' "${sha:0:7}" "$subject" "$verdict"
  done <<<"$list"
  echo "$yes of $total merges would have deployed on their PR's green run without re-running the checks"
  exit 0
fi

sha="${1:?usage: deploygate.sh <sha> [<main before>] | --history <n>}"
verdict=$(judge "$sha" "${2:-}")
echo "$verdict"
last=$(echo "$verdict" | tail -1)
tested="${last%% *}"
[ -n "${GITHUB_OUTPUT:-}" ] && echo "tested=$tested" >> "$GITHUB_OUTPUT"
if [ "$tested" = true ]; then
  echo "::notice title=Checks already passed::${last#true }"
fi
