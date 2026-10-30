#!/usr/bin/env bash
# The owner's Mac runs no job but main's deploy (PLAN.md 19ah, docs/mac-runner.md).
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
# here, on the Mac, where no branch's workflow can edit it: a job is taken
# only when it is a push to main or a run by hand on main, of `deploy.yml`.
# A `pull_request_target` or `workflow_run` run also carries main as its ref,
# with main's workflow, which is why the event is named and not only the ref.
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
    *) refuse "event '${GITHUB_EVENT_NAME:-}' is not a push or a run by hand" ;;
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
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=pull_request GITHUB_REF=refs/pull/1/merge
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=pull_request_target GITHUB_REF=refs/heads/main "$W"
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=workflow_run GITHUB_REF=refs/heads/main
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=schedule GITHUB_REF=refs/heads/main
expect refuse  GITHUB_REPOSITORY=$REPO GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main GITHUB_WORKFLOW_REF=$REPO/.github/workflows/mine.yml@refs/heads/main
expect refuse  GITHUB_REPOSITORY=someone/fork GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main "$W"
expect refuse  GITHUB_EVENT_NAME=push GITHUB_REF=refs/heads/main
expect refuse
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
