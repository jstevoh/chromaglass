#!/usr/bin/env bash
# Make this Mac a runner for main's deploys and for the checks of pull requests
# from this repository's own branches (PLAN.md 19ah, 19ah-6, docs/mac-runner.md).
#
# Run by the owner, at the Mac, in Terminal, signed in to `gh` as the
# repository's owner. Every step can be run again: each one is skipped when it
# is already done. Not as root: the runner runs the checks as this user, in a
# LaunchAgent, so Chromium gets the GPU of the logged-in session.
#
#   bash scripts/macrunner-setup.sh            (the runner is named owner-mac)
#   bash scripts/macrunner-setup.sh other-mac  (a second machine, same label)
#
# No token is printed or written to a file by this script. The runner's
# registration token goes from GitHub's API to config.sh in a variable; the
# probe's token is typed at a hidden prompt and goes straight to `gh secret
# set`. The runner keeps its own credentials in ~/actions-runner, as every
# self-hosted runner does.
set -euo pipefail
REPO=jstevoh/chromaglass
DIR="$HOME/actions-runner"
NAME="${1:-owner-mac}"
LABEL=owner-mac
here="$(cd "$(dirname "$0")/.." && pwd)"

[ "$(id -u)" != 0 ] || { echo "run this as your own user, not root"; exit 1; }
[ "$(uname -sm)" = "Darwin arm64" ] || { echo "this is for an Apple Silicon Mac"; exit 1; }
gh auth status > /dev/null 2>&1 || { echo "sign in first: gh auth login"; exit 1; }

echo "1. Pull requests from outside contributors wait for your approval before any workflow runs"
# The repository is public and its runner is this Mac: a fork's pull request
# brings its own workflow, which could ask for this runner by name. Approval
# for every outside contributor, not only first-timers, is GitHub's own
# advice for a public repository with a self-hosted runner.
gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" -f approval_policy=all_external_contributors
echo "   approval_policy: $(gh api "repos/$REPO/actions/permissions/fork-pr-contributor-approval" --jq .approval_policy)"

echo "2. The runner, in $DIR"
mkdir -p "$DIR"
cd "$DIR"
if [ ! -x ./config.sh ]; then
  rel=$(gh api repos/actions/runner/releases/latest)
  tag=$(jq -r .tag_name <<< "$rel")
  sha=$(jq -r .body <<< "$rel" | sed -n 's/.*BEGIN SHA osx-arm64 -->\([0-9a-f]\{64\}\)<.*/\1/p')
  [ -n "$sha" ] || { echo "   the release notes of $tag carry no osx-arm64 checksum; stopping rather than run an unchecked download"; exit 1; }
  curl -fsSL -o runner.tgz "https://github.com/actions/runner/releases/download/$tag/actions-runner-osx-arm64-${tag#v}.tar.gz"
  echo "$sha  runner.tgz" | shasum -a 256 -c -
  tar xzf runner.tgz
  rm runner.tgz
  echo "   $tag unpacked, checksum matched"
else
  echo "   already unpacked"
fi

echo "3. Registered with the repository as $NAME, label $LABEL"
if [ ! -f .runner ]; then
  tok=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)
  ./config.sh --unattended --url "https://github.com/$REPO" --token "$tok" --name "$NAME" --labels "$LABEL" --work _work --replace
  unset tok
else
  echo "   already registered"
fi

echo "4. The runner refuses every job but main's deploy"
# Any branch pushed here can bring a workflow that asks for this runner by
# name, and the approval in step 1 covers forks only. So the runner itself
# checks each job before it starts (scripts/macrunner-hook.sh): a push to main
# or a run by hand on main, of deploy.yml, or the job fails before its first
# step. The copy that runs lives in ~/.chromaglass-runner, outside the runner's
# folder, where no job's checkout and no runner update writes; it is copied
# from this checkout, so run this script from main.
HOOKDIR="$HOME/.chromaglass-runner"
mkdir -p "$HOOKDIR"
install -m 755 "$here/scripts/macrunner-hook.sh" "$HOOKDIR/job-started.sh"
bash "$HOOKDIR/job-started.sh" --selftest | tail -1
restart=0
if ! grep -qx "ACTIONS_RUNNER_HOOK_JOB_STARTED=$HOOKDIR/job-started.sh" .env 2> /dev/null; then
  touch .env
  grep -v '^ACTIONS_RUNNER_HOOK_JOB_STARTED=' .env > .env.new || true
  echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=$HOOKDIR/job-started.sh" >> .env.new
  mv .env.new .env
  restart=1
  echo "   hook set in $DIR/.env"
else
  echo "   hook already set"
fi

echo "5. Started now and at every login (a LaunchAgent, as you)"
# The runner reads .env when it starts, so a running one is restarted when
# step 4 changed it.
if ./svc.sh status 2> /dev/null | grep -q 'Started'; then
  [ "$restart" = 0 ] || { ./svc.sh stop; ./svc.sh start; }
else
  ./svc.sh install > /dev/null 2>&1 || true
  ./svc.sh start
fi
./svc.sh status | grep -E 'Started|Stopped|not installed' || true

echo "6. The deploy's probe can see the runner"
# The environment main uses for the deploy's probe, and since 19ah-6 the
# branches the sessions push (`claude/…`, `antigravity/…`) for a pull request's
# probe: GitHub matches a pull request's run against its head branch's name.
# The token in it reads the repository's runners and nothing else; no key
# that can publish or sign is in this environment (scripts/cisecrets.mjs).
gh api -X PUT "repos/$REPO/environments/mac-runner" --input - > /dev/null <<< '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
have=$(gh api "repos/$REPO/environments/mac-runner/deployment-branch-policies" --jq '.branch_policies[].name')
for b in main 'claude/*' 'antigravity/*'; do
  grep -qxF "$b" <<< "$have" ||
    gh api -X POST "repos/$REPO/environments/mac-runner/deployment-branch-policies" -f name="$b" -f type=branch > /dev/null
done
if gh secret list --env mac-runner --repo "$REPO" | grep -q '^MAC_RUNNER_PROBE'; then
  echo "   MAC_RUNNER_PROBE is set already (to replace it: gh secret set MAC_RUNNER_PROBE --env mac-runner --repo $REPO)"
else
  echo "   Make a fine-grained token: https://github.com/settings/personal-access-tokens/new"
  echo "     name: chromaglass mac probe · expiration: a year · Repository access: Only select repositories → chromaglass"
  echo "     Permissions → Repository → Administration: Read-only (nothing else) → Generate token, then copy it"
  open "https://github.com/settings/personal-access-tokens/new" 2> /dev/null || true
  read -rsp "   Paste it here (not shown): " probe
  echo
  printf %s "$probe" | gh secret set MAC_RUNNER_PROBE --env mac-runner --repo "$REPO"
  unset probe
fi

echo "7. What a deploy would do now"
GH_TOKEN=$(gh auth token) node "$here/scripts/macrunner.mjs" --dry
