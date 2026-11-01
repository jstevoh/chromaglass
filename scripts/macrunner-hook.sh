#!/usr/bin/env bash
# The owner's Mac runs main's deploy, and the checks of a pull request from a
# branch of this repository, and nothing else (PLAN.md 19ah, 19ah-6,
# docs/mac-runner.md).
#
# GitHub's runner calls this before every job it takes, as the job-started
# hook (ACTIONS_RUNNER_HOOK_JOB_STARTED in ~/actions-runner/.env, which
# `scripts/macrunner-setup.sh` writes), and fails the job, before any of its
# steps, when it exits non-zero.
#
# Why the runner itself has to refuse, and not only `checks.yml`: the
# workflows decide which runner a job asks for, and any branch pushed to this
# repository can carry its own workflow that asks for `owner-mac` by name. The
# approval for outside contributors covers forks only, and a personal
# repository has no runner groups to fence the runner off. So the guard is
# here, on the Mac, where no branch's workflow can edit it.
#
# Two kinds of job are taken. A push to main or a run by hand on main, of
# `deploy.yml`: a `pull_request_target` or `workflow_run` run also carries main
# as its ref, with main's workflow, which is why the event is named and not
# only the ref. And, since 19ah-6 (the owner, 2026-10-30), a `pull_request` run
# of `checks.yml` whose head branch lives in this repository. Only someone who
# can push here can make such a branch (the owner, and the sessions that work
# for the owner, which already run on this Mac), so its code is no stranger
# than theirs. A fork's pull request is the public's: its code, and even its
# workflow, are whoever opened it, so it is refused, as is a bot's (a
# dependency bump runs its packages' install scripts). Which repository the
# head branch is in is not in any variable a job gets, so it is read from the
# event itself (GITHUB_EVENT_PATH), with jq, which macOS carries; no payload,
# no jq, or an answer that is not exactly this repository is a refusal.
#
# The copy that runs lives outside ~/actions-runner (in ~/.chromaglass-runner),
# where the runner's own updates never reach. Anything missing is a refusal.
#
#   bash scripts/macrunner-hook.sh --selftest
set -uo pipefail
REPO=jstevoh/chromaglass

refuse() { echo "::error title=Not a job for the owner's Mac::$1 (docs/mac-runner.md)"; exit 1; }

check() {
  [ "${GITHUB_REPOSITORY:-}" = "$REPO" ] || refuse "repository '${GITHUB_REPOSITORY:-}' is not $REPO"
  case "${GITHUB_EVENT_NAME:-}" in
    push | workflow_dispatch) ;;
    pull_request) pull; return ;;
    *) refuse "event '${GITHUB_EVENT_NAME:-}' is not a push, a run by hand or a pull request" ;;
  esac
  [ "${GITHUB_REF:-}" = refs/heads/main ] || refuse "ref '${GITHUB_REF:-}' is not main"
  # The workflow the run started from (a reusable one's caller): deploy.yml
  # on main. Checked when the runner gives it, which it does from 2.300 on.
  if [ -n "${GITHUB_WORKFLOW_REF:-}" ]; then
    [ "$GITHUB_WORKFLOW_REF" = "$REPO/.github/workflows/deploy.yml@refs/heads/main" ] ||
      refuse "workflow '$GITHUB_WORKFLOW_REF' is not main's deploy.yml"
  fi
  echo "a job of main's deploy ($GITHUB_EVENT_NAME, run ${GITHUB_RUN_ID:-?}): taken"
}

# A pull request's checks: checks.yml at the PR's merge ref, from a branch of
# this repository, opened by a person. The branch can edit checks.yml, so
# naming it guards nothing on its own; it keeps any other workflow a branch
# writes off the Mac, as main's rule does.
pull() {
  [[ "${GITHUB_REF:-}" =~ ^refs/pull/[0-9]+/merge$ ]] || refuse "pull request ref '${GITHUB_REF:-}' is not a merge ref"
  [[ "${GITHUB_WORKFLOW_REF:-}" =~ ^$REPO/\.github/workflows/checks\.yml@refs/pull/[0-9]+/merge$ ]] ||
    refuse "workflow '${GITHUB_WORKFLOW_REF:-}' is not the pull request's checks.yml"
  [ -r "${GITHUB_EVENT_PATH:-}" ] || refuse "no event payload to say where the pull request's branch is"
  command -v jq > /dev/null || refuse "no jq to read the event payload"
  local head author
  head=$(jq -r '.pull_request.head.repo.full_name // empty' "$GITHUB_EVENT_PATH" 2> /dev/null)
  author=$(jq -r '.pull_request.user.type // empty' "$GITHUB_EVENT_PATH" 2> /dev/null)
  [ "$head" = "$REPO" ] || refuse "the pull request's branch is in '$head', not $REPO (a fork's)"
  [ "$author" = User ] || refuse "the pull request was opened by a '$author', not a person"
  echo "the checks of a pull request from a branch of $REPO (run ${GITHUB_RUN_ID:-?}): taken"
}

if [ "${1:-}" != --selftest ]; then check; exit 0; fi

# Every way a job can arrive, and what the guard must say. Each case runs the
# guard in a clean environment holding only the variables given.
pass=0 fail=0
expect() {
  local want="$1"; shift
  if env -i PATH="$PATH" "$@" bash "$0" > /dev/null 2>&1; then got=take; else got=refuse; fi
  if [ "$got" = "$want" ]; then pass=$((pass + 1)); echo " ok   $want: $*"; else fail=$((fail + 1)); echo " FAIL wanted $want, got $got: $*"; fi
}
W="GITHUB_WORKFLOW_REF=$REPO/.github/workflows/deploy.yml@refs/heads/main"
expect take    GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main "$W"
expect take    GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=workflow_dispatch GITHUB_REF=refs/heads/main "$W"
expect take    GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/claude/x
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=workflow_dispatch GITHUB_REF=refs/heads/claude/x
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=push GITHUB_REF=refs/tags/main
# A pull request: its event payload, as the runner writes it, says where the
# head branch lives and who opened it.
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
ev() { printf '{"pull_request":{"head":{"repo":{"full_name":"%s"}},"user":{"type":"%s"}}}' "$1" "$2" > "$T/$3"; echo "GITHUB_EVENT_PATH=$T/$3"; }
OURS=$(ev "$REPO" User ours.json); FORK=$(ev someone/chromaglass User fork.json); BOT=$(ev "$REPO" Bot bot.json)
printf '{"pull_request":{"user":{"type":"User"}}}' > "$T/nohead.json"; NOHEAD="GITHUB_EVENT_PATH=$T/nohead.json"
printf 'not json' > "$T/junk.json"; JUNK="GITHUB_EVENT_PATH=$T/junk.json"
P="GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=pull_request GITHUB_REF=refs/pull/12/merge"
C="GITHUB_WORKFLOW_REF=$REPO/.github/workflows/checks.yml@refs/pull/12/merge"
expect take    $P "$C" "$OURS"
expect refuse  $P "$C" "$FORK"
expect refuse  $P "$C" "$BOT"
expect refuse  $P "$C" "$NOHEAD"
expect refuse  $P "$C" "$JUNK"
expect refuse  $P "$C" GITHUB_EVENT_PATH=$T/missing.json
expect refuse  $P "$C"
expect refuse  $P "$OURS"
expect refuse  $P "GITHUB_WORKFLOW_REF=$REPO/.github/workflows/mine.yml@refs/pull/12/merge" "$OURS"
expect refuse  $P "GITHUB_WORKFLOW_REF=someone/chromaglass/.github/workflows/checks.yml@refs/pull/12/merge" "$OURS"
expect refuse  $P "GITHUB_WORKFLOW_REF=$REPO/.github/workflows/checks.yml@refs/heads/main" "$OURS"
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=pull_request GITHUB_REF=refs/heads/claude/x "$C" "$OURS"
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=pull_request GITHUB_REF=refs/pull/12/head "$C" "$OURS"
expect refuse  GITHUB_REPOSITORY=someone/fork GITHUB_EVENT_NAME=pull_request GITHUB_REF=refs/pull/12/merge "$C" "$OURS"
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=pull_request_target GITHUB_REF=refs/pull/12/merge "$C" "$OURS"
# And a Mac without jq refuses: a PATH that holds bash and nothing else.
mkdir "$T/nojq"; ln -s "$(command -v bash)" "$T/nojq/bash"
expect refuse  $P "$C" "$OURS" PATH="$T/nojq"
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=pull_request_target GITHUB_REF=refs/heads/main "$W"
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=workflow_run GITHUB_REF=refs/heads/main
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=schedule GITHUB_REF=refs/heads/main
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main GITHUB_WORKFLOW_REF=$REPO/.github/workflows/mine.yml@refs/heads/main
expect refuse  GITHUB_REPOSITORY=someone/fork GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main "$W"
expect refuse  GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main
expect refuse
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
