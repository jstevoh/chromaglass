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
#   3. that run ran the Mac shards. Since PLAN.md 19h a PR that changes only
#      files no Mac shard reads (PLAN.md, the docs, the skills, a workflow
#      that never runs one) skips them and its `WebGPU (macOS)` still goes
#      green. Its tree's code is whatever main's was, and main's last deploy
#      may have been red, so a skipped run proves nothing about the Mac and
#      the deploy runs them itself;
#   4. the commit that run tested has the same git tree as the pushed commit;
#      or, since 2026-10-04 (the owner's choice), rule 5 below (`apart`): the
#      files the PR changed and the files main changed since the run's base
#      are different files, and no deploy since the run's base went red. Then the
#      verdict is `disjoint`, and the deploy runs Measure but not the Mac.
#      A pull_request run tests GitHub's merge of the head into its base, and
#      `checks.yml` writes that merge's SHA into the run's title, so this is
#      the same tree read directly, not inferred. It closes the case a head
#      rule cannot see: a stacked PR moved onto main after its only run, which
#      tested the head merged into another branch.
#
#   6. (PLAN.md 19j, 2026-10-04) Before any of that: if no file the live site
#      is built from differs between the pushed tree and the commit that is
#      live, the verdict is `nothing`, and the deploy neither checks nor
#      publishes. Eight of the thirty merges to 2026-10-04 changed no site file
#      (PLAN.md, the docs, check scripts, workflows), and their deploys still
#      ran the checks: 84bb112 (#245, docs only) went live 79 minutes after its
#      merge, behind the whole Mac; 3586ead and e199bd3 (check scripts) spent 8
#      minutes each on Measure. Those three answer `nothing` now. The tree that
#      is live already passed every check before it was published, and a build
#      of the same site files is the same site: `vite build` of each of the
#      three and of the commit live before it gave the same 25 files byte for
#      byte, where a merge that changed six site files (87b06a6) differed in 8.
#      So there is nothing to measure and nothing to put up. A changed check
#      script still ran on its own PR, and the next merge that changes the site
#      is measured as before.
#
#      The other five did not qualify, rightly. Two were deploy runs GitHub
#      cancelled before they started, a newer merge taking their place in the
#      concurrency group. Three (d027626, 872b44d, d9302e5) came straight after
#      a site change whose own run had been cancelled or gone red, so that
#      change was not yet live and their run was the one to check and publish
#      it: d027626's 111 minutes were three PRs' site changes going out.
#
#      "The commit that is live" is the head of the newest deploy run, on any
#      branch, that succeeded and started before this push's own run. A successful run that published
#      nothing (this rule) had the live commit's site files, so the chain
#      holds through it. It is compared with the commit live then, not with the
#      push's parent: a docs-only merge on top of a site change whose deploy went
#      red differs from what is live, and is deployed (and checked) in full.
#      "Built from" is `reach.mjs --site` (src/, public/, index.html, the build
#      config, the lockfile, package.json, firebase.json), plus this workflow
#      and .firebaserc, which decide how it is built and where it goes, and
#      this script and reach.mjs, so the gate never judges its own change;
#      package.json counts unless only scripts the build never runs changed.
#      A rollback or a deploy from outside this workflow would make the newest
#      green run not the live one: anything that publishes must do it here.
#      A re-run of an old deploy does publish here, and counts by when it ran.
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
#                                        prints tested=nothing|true|disjoint|false and why;
#                                        appends tested=… to $GITHUB_OUTPUT if set
#   scripts/deploygate.sh --history <n>  replays the last n merges on main and
#                                        counts how many would have skipped
#   (`npm run deploygate -- --history 20`)
#
# Needs curl and jq. Uses $GH_TOKEN when set (CI). The repository is public, so
# it runs unauthenticated too, but a replay makes about seven calls a merge
# against an hourly limit of 60 without a token: GH_TOKEN=$(gh auth token).
set -euo pipefail
# comm and sort must agree on order.
export LC_ALL=C
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

# The paths whose blobs differ between two trees, one a line, sorted: added,
# removed and changed alike. From the API's recursive listing, so the deploy
# needs no history; a listing GitHub truncated is an error, never a short diff.
paths() {
  api "git/trees/$1?recursive=1" | jq -er 'if .truncated then error("truncated tree") else [.tree[] | select(.type == "blob") | "\(.path) \(.sha)"] end | .[]'
}
treediff() {
  local a b
  a=$(paths "$1") && b=$(paths "$2") || return 1
  # A line in exactly one listing is a path whose blob differs (or exists on one
  # side only); sed takes the path and sort -u folds the two lines of a change.
  sort <(printf '%s\n' "$a") <(printf '%s\n' "$b") | uniq -u | sed 's/ [0-9a-f]*$//' | sort -u
}

# package.json as the build reads it: "scripts" dropped, except `build` (which
# the deploy and the Mac shards run) and the hooks `npm ci` runs around install.
pkg() {
  api "contents/package.json?ref=$1" | jq -er .content | base64 -d \
    | jq -S '.scripts |= with_entries(select(.key | test("^(pre|post)?(build|install)$|^prepare$")))'
}
# Did package.json change only in scripts the build does not run, $1 to $2?
scriptsonly() {
  local a b
  a=$(pkg "$1") && b=$(pkg "$2") || return 1
  [ "$a" = "$b" ]
}

# Rule 5, the owner's choice of 2026-10-04: the PR's run tested its head merged
# into an older main, and main has moved since. Re-running all four Mac shards
# over the deployed tree added about fifty minutes from merge to live, and on
# 2026-10-03 went red 4 times in 9, every time on a line the merge never
# touched (PLAN.md 19h-3). So the Mac is trusted when what the PR changed and
# what main changed since the run's base are different files of the site, and
# every commit main took since that base either went live through a green
# deploy or would itself have passed this gate. The deploy still runs Measure
# (typecheck and the harnesses) on the exact tree, which is what catches one
# PR calling a function another changed; what nothing measures is two changes
# in different files moving the same picture, which the next PR's own run (on
# main with both in it) measures within hours.
#
# Every unreadable answer is "false" (the Mac runs): a check-skeptic review
# turned a failing filter, a 403 under bash 3.2 and a re-run red deploy into
# "disjoint" before each was closed here.
#
#   $1 the commit the run tested (GitHub's merge of the head into the base)
#   $2 the tree being deployed     $3 main before the push
apart() {
  local tested="$1" tree="$2" before="$3" base tbase ttested tbefore pr moved since common overlap stray cmp shas runs bad x v
  [ -n "$before" ] || { echo "false no main before the push"; return; }
  base=$(api "commits/$tested" | jq -r 'if (.parents | length) == 2 then .parents[0].sha else empty end') || { echo "false the tested commit could not be read"; return; }
  [ -n "$base" ] || { echo "false the tested commit is not a PR's merge"; return; }
  # The base must be main as it once stood: a stacked PR's run merged into
  # another branch, whose own changes would otherwise read as "main's".
  cmp=$(api "compare/$base...$before") || { echo "false main since the run's base could not be read"; return; }
  jq -e '(.status == "ahead" or .status == "identical") and .total_commits == (.commits | length)' <<<"$cmp" >/dev/null \
    || { echo "false the run's base ${base:0:7} is not an earlier main (or more than 250 commits behind)"; return; }
  shas=$(jq -r '.commits[].sha' <<<"$cmp")
  tbase=$(treeof "$base") && ttested=$(treeof "$tested") && tbefore=$(treeof "$before") || { echo "false a tree could not be read"; return; }
  [ -n "$tbase" ] && [ -n "$ttested" ] && [ -n "$tbefore" ] || { echo "false a tree could not be read"; return; }
  pr=$(treediff "$tbase" "$ttested") || { echo "false the PR's files could not be listed"; return; }
  moved=$(treediff "$ttested" "$tree") || { echo "false the deployed tree could not be listed"; return; }
  since=$(treediff "$tbase" "$tbefore") || { echo "false main's newer files could not be listed"; return; }
  # Only files the live site is built from count (scripts/reach.mjs --site):
  # on 2026-10-03 every merge shared checks.yml and package.json with the one
  # before (each PR adds its check's step and script), and every PR edits
  # PLAN.md; none of that can break the site between two PRs. package.json
  # counts unless one side changed only scripts the build never runs.
  common=$(comm -12 <(printf '%s\n' "$pr") <(printf '%s\n' "$moved") | grep -v '^$' || true)
  overlap=$(printf '%s\n' "$common" | grep -v '^$' | node "$(dirname "$0")/reach.mjs" --reaching --site) \
    || [ -z "$common" ] || { echo "false the site filter failed"; return; }
  if grep -qx package.json <<<"$overlap" && { scriptsonly "$base" "$tested" || scriptsonly "$base" "$before"; }; then
    overlap=$(grep -vx package.json <<<"$overlap" || true)
  fi
  [ -z "$overlap" ] || { echo "false the PR and main's newer changes both touch $(echo "$overlap" | head -3 | paste -sd' ')"; return; }
  # Everything that differs from what was tested must be main's own newer
  # change; anything else (a squash that is not head + main) is unexplained.
  stray=$(comm -23 <(printf '%s\n' "$moved") <(printf '%s\n' "$since") | grep -v '^$' || true)
  [ -z "$stray" ] || { echo "false $(echo "$stray" | head -3 | paste -sd' ') differs from the tested tree and is not main's change"; return; }
  # Every commit main took since the base: green if any deploy of it
  # succeeded; red if one failed, timed out, is still going, or was cancelled
  # after a failed attempt; not found if no deploy of it is among the last
  # hundred. A first attempt cancelled (a newer merge took its waiting place)
  # proves nothing, so that commit is judged as its own deploy would have
  # judged it, one level deep: true or disjoint, or the Mac runs here.
  runs=$(api "actions/workflows/deploy.yml/runs?branch=main&per_page=100") || { echo "false main's deploys could not be read"; return; }
  bad=""
  for x in $shas; do
    v=$(jq -r --arg h "$x" '[.workflow_runs[] | select(.head_sha == $h)]
      | if length == 0 then "none"
        elif any(.conclusion == "success") then "green"
        elif all(.conclusion == "cancelled" and .run_attempt == 1) then "replaced"
        else "red" end' <<<"$runs") || { echo "false main's deploys could not be read"; return; }
    if [ "$v" = replaced ]; then
      if [ "${GATE_DEPTH:-0}" -ge 1 ]; then continue; fi
      v=$(GATE_DEPTH=1 judge "$x" | tail -1) || v=false
      # nothing: it would have published nothing, the live site being its own.
      case "${v%% *}" in true|disjoint|nothing) continue ;; esac
      v="replaced and would not have passed"
    fi
    [ "$v" = green ] || bad="$bad ${x:0:7} ($v)"
  done
  [ -z "$bad" ] || { echo "false main since the run's base has commits not known good:$bad"; return; }
  echo "disjoint the PR's $(printf '%s\n' "$pr" | grep -c . || true) files and main's $(printf '%s\n' "$moved" | grep -c . || true) newer ones are apart, and every commit since went live green or would have passed"
}

# Rule 6: echoes "nothing <why>" when no file the site is built from differs
# between the pushed commit and the one that is live, and nothing at all
# otherwise (including when anything cannot be read: the other rules decide).
#   $1 the pushed commit   $2 its tree
unchanged() {
  local sha="$1" tree="$2" runs mine live ltree diff site deployable
  # Every run of this workflow, on whichever branch: a run by hand started from
  # another branch publishes to the same live channel.
  runs=$(api "actions/workflows/deploy.yml/runs?per_page=100") || return 0
  # When this run started: in CI the run that is going ($GITHUB_RUN_ID, so a
  # main pushed back to an older commit is not taken for that commit's first
  # deploy); in a replay (--history, or rule 5 judging a replaced commit) the
  # push's own first deploy. A run missing from the listing gives no verdict.
  if [ -n "${GITHUB_RUN_ID:-}" ] && [ "$sha" = "${GITHUB_SHA:-}" ] && [ "${GATE_DEPTH:-0}" = 0 ]; then
    mine=$(jq -r --argjson id "$GITHUB_RUN_ID" '[.workflow_runs[] | select(.id == $id)] | first | .run_started_at // empty' <<<"$runs") || return 0
  else
    mine=$(jq -r --arg h "$sha" '[.workflow_runs[] | select(.head_sha == $h and .event == "push")] | min_by(.run_number) | .run_started_at // empty' <<<"$runs") || return 0
  fi
  [ -n "$mine" ] || return 0
  # What is live is what the last green run before this one published, "last"
  # by when it ran, not by its number: a re-run keeps its number, so an old
  # deploy re-run after newer ones (209, 211, 215 and 218 were re-run on
  # 2026-10-03) put its older tree up last, and a docs merge after it must
  # replace that, not leave it. run_started_at is the latest attempt's start,
  # and the concurrency group runs one deploy at a time and drops a waiting one
  # when a newer one queues, so every run that started before this one has
  # finished, in the order they started.
  live=$(jq -r --arg t "$mine" '[.workflow_runs[] | select(.conclusion == "success" and .run_started_at < $t)]
    | max_by(.run_started_at) | .head_sha // empty' <<<"$runs") || return 0
  [ -n "$live" ] || return 0
  ltree=$(treeof "$live") || return 0
  [ -n "$ltree" ] || return 0
  diff=$(treediff "$ltree" "$tree") || return 0
  # A filter that fails must not read as "no site file": only an empty diff
  # may leave $site empty without reach.mjs answering.
  site=$(printf '%s\n' "$diff" | grep -v '^$' | node "$(dirname "$0")/reach.mjs" --reaching --site) \
    || [ -z "$diff" ] || return 0
  # Besides the site's own files: this workflow and .firebaserc, which decide
  # how it is built and where it goes, and this gate and reach.mjs, which would
  # otherwise judge their own change (a SITE list narrowed in the same merge as
  # a change to src/ would wave that change through).
  deployable=$( { printf '%s\n' "$site"
                  printf '%s\n' "$diff" | grep -xE '\.github/workflows/deploy\.yml|\.firebaserc|scripts/deploygate\.sh|scripts/reach\.mjs' || true; } \
                | grep -v '^$' | sort -u || true)
  if grep -qx package.json <<<"$deployable" && scriptsonly "$live" "$sha"; then
    deployable=$(grep -vx package.json <<<"$deployable" || true)
  fi
  [ -z "$deployable" ] || return 0
  echo "nothing no file the site is built from differs from ${live:0:7}, which is live ($(printf '%s\n' "$diff" | grep -c . || true) other files do): nothing to check or publish"
}

# Echoes "nothing <why>", "true <why>", "disjoint <why>" or "false <why>" for
# one commit on main; $2 is main before it (defaults to the commit's first parent, which for
# a squash merge is the same commit).
judge() {
  local sha="$1" before="${2:-}" commit tree heads entry pr head runs run url tested ttree htree status verdict shards newest
  commit=$(api "commits/$sha")
  sha=$(jq -r .sha <<<"$commit")
  tree=$(jq -r '.commit.tree.sha // empty' <<<"$commit")
  [ -n "$tree" ] || { echo "false could not read the pushed commit's tree"; return; }
  verdict=$(unchanged "$sha" "$tree")
  [ -z "$verdict" ] || { echo "$verdict"; return; }
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
      # The four shards by name, every one green: a run that skipped them, or
      # ran fewer, is not a Mac run. A new shard in checks.yml goes here too.
      shards=$(api "actions/runs/${url##*/}/jobs?per_page=100&filter=latest" \
        | jq -r '[.jobs[] | select(.name | startswith("WebGPU (macOS) ·")) | "\(.name | ltrimstr("WebGPU (macOS) · "))=\(.conclusion)"] | sort
          | if . == ["open=success", "plate=success", "show=success", "tools=success"] then "ran" else (join(",") | if . == "" then "none" else . end) end')
      if [ "$shards" != ran ]; then
        echo "false #$pr's run $url did not run the Mac shards ($shards)"; continue
      fi
      if [ "$tested" != - ]; then
        ttree=$(treeof "$tested")
        if [ -n "$ttree" ] && [ "$ttree" = "$tree" ]; then
          echo "true #$pr's run tested ${tested:0:7}, the tree being deployed, and passed: $url"; return
        fi
        # Rule 5 trusts a run on an older main, so it must be the head's
        # newest: a reopened PR's later run, red on a newer main, outranks an
        # older green one.
        newest=$(api "actions/workflows/checks.yml/runs?head_sha=$head&event=pull_request&per_page=1" | jq -r '.workflow_runs[0].id // empty') || newest=""
        if [ "$newest" != "${url##*/}" ]; then
          echo "false #$pr's run $url tested ${tested:0:7}, not the tree being deployed, and is not the head's newest run"; continue
        fi
        verdict=$(apart "$tested" "$tree" "$before") || verdict="false rule 5 could not be read"
        if [ "${verdict%% *}" = disjoint ]; then
          echo "disjoint #$pr's run $url tested ${tested:0:7}; ${verdict#disjoint }"; return
        fi
        echo "false #$pr's run $url tested ${tested:0:7}, not the tree being deployed: ${verdict#false }"
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
  n="${2:-20}"; yes=0; apartn=0; nothingn=0; total=0
  # Read first, so a failed call stops the script instead of replaying nothing.
  list=$(api "commits?sha=main&per_page=$n" | jq -r '.[] | "\(.sha) \(.commit.message | split("\n")[0])"')
  [ -n "$list" ] || { echo "no commits on main to replay" >&2; exit 1; }
  while read -r sha subject; do
    verdict=$(judge "$sha" | tail -1)
    total=$((total + 1)); [ "${verdict%% *}" = true ] && yes=$((yes + 1))
    [ "${verdict%% *}" = disjoint ] && apartn=$((apartn + 1))
    [ "${verdict%% *}" = nothing ] && nothingn=$((nothingn + 1))
    printf '%s %-60.60s %s\n' "${sha:0:7}" "$subject" "$verdict"
  done <<<"$list"
  echo "$yes of $total merges would have deployed on their PR's green run without re-running the checks,"
  echo "and $apartn more with Measure alone, their files apart from main's newer changes (rule 5);"
  echo "$nothingn needed no deploy at all, no file the site is built from differing from what was live (rule 6)"
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
elif [ "$tested" = disjoint ]; then
  echo "::notice title=Mac checks passed on the PR, files apart from main's newer changes::${last#disjoint }"
elif [ "$tested" = nothing ]; then
  echo "::notice title=Nothing to deploy::${last#nothing }"
fi
