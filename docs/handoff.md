# Two tools on one repo: handing work across

Sessions on this repo come from two tools: Claude Code (branches `claude/…`) and
Antigravity (branches `antigravity/…`). Whichever one has credit carries on with the plan,
and when both do, they split it by lane. Everything in `CLAUDE.md` applies to both.
This file covers only what two tools need on top of it: how one claims work, how it hands
work over, and how Claude Code checks what Antigravity shipped, since Antigravity cannot
run the agents and skills in `.claude/`.

GitHub holds all the shared state. Neither tool can see the other's conversation, so a
handoff that is not in a branch, a PR or `PLAN.md` never happened.

## Who takes what

Rewritten 2026-10-24 from what three weeks of Antigravity PRs showed (the project's
scorecard; numbers without names, since the repo is public). The work that came back
clean on its first review was narrow and already defined: a UI change with its phone
version, a rename, a port, a fix with a check to turn green (three of five first passes
in the week to 10-19). The work that went three to five rounds was open-ended physics and
taste, where the PR also wrote or moved its own check: of the reasons reviews failed, wrong
physics, a check that passes without the feature, and a moved bar came up most. And the
one change that reached the live site broken was sign-in and keys. So the split is by
what the job needs, not by lane:

**Antigravity takes:**

- **What needs a real GPU, by default.** It runs on the owner's Mac and can read the
  app's frames, which a cloud session cannot (the "What can be verified where" table in
  `CLAUDE.md`): reproducing a red that only the Mac shards show, `npm run stages`
  numbers (frame budget, a tool's cost), `film.yml` runs (cloud sessions get a 403 on
  `workflow_dispatch`), and the before and after pictures a look change needs. A Claude
  Code session can do the same through a Remote Control session on that Mac (and drive
  its screen and browser), but that spends Claude's quota rather than Antigravity's and
  holds the one GPU, so it is for when Antigravity is out of credit or the GPU run is
  part of a root cause Claude Code is already chasing.
- **Builds with "done" already written down.** A plan item whose check exists and fails
  on `main`, with the number to reach: UI panels and their phone versions, settings
  plumbing, layout, ports, renames, deleting code a plan item already decided to delete,
  tuning a preset toward a number a check reads.
- **Physics and look builds from a brief.** Only once a Claude Code session has written
  the brief and its check, shown red on `main`: the brief names the phenomenon, the
  number and the check, and the PR changes neither the check nor its bar.

**Claude Code keeps:**

- Writing and changing checks, and briefs (the check first).
- Open-ended physics or look work that has no check yet, root causes, and diagnosis.
- Sign-in, keys, payments, licences, the Workers under `server/`, the deploy and the CI
  workflows.
- Reviews, and merging the PRs it passes ("Ready, review, merge").
- `PLAN.md` restructuring and the docs.

**Two rounds, then it comes back.** An Antigravity PR that gets `CHANGES` twice is
labelled `handoff` and a Claude Code session finishes it on the same branch, rather than
a third round: rounds three to five cost more than one session taking it over, and each
round's late fixes were where the moved bars came from.

Either tool takes the other's kind of work when the other is out of credit, in Order of
work order. A cloud session that reaches a GPU-only step says so in its PR and leaves the
pixels to the Mac CI or to Antigravity.

## Claiming

- Before starting, run `gh pr list` and `git log origin/main -10`, then take the first
  open step of `PLAN.md`'s Order of work in a lane that no open PR touches. To see a PR's
  lane, look at its files: `gh pr view <n> --json files`.
- **The draft PR is the claim.** Push the branch and open the draft PR before the work is
  done, with the plan item's number at the start of the title (`0-tap: …`). A step with an
  open PR belongs to that PR's tool until the PR merges, closes, or is labelled `handoff`.
- Lane G (`LiquidVisualizer.tsx`) holds one session at a time, whichever tool it is. If
  a fix seems to need G while G is held, look for a seam outside it first. The 0-tap check
  read the tempo through `App.tsx` for this reason.
- Never push to a branch the other tool owns unless its PR carries `handoff`.

## Small and short-lived

A PR's cost grows with how long it lives, not only with how big it is. On 2026-10-24 all
five open Antigravity PRs had fallen behind `main` and conflicted with it, and one (#355,
opened 13 days earlier) broke when `main` was merged in. Five sat as review-owed at once.
So:

- **One plan item per PR** (`18a-13c`, not `18a-13`). Something else found along the way
  is a new line in `PLAN.md`, not more commits here.
- **Small.** Aim for under about 400 changed lines outside `PLAN.md` and the checks. A
  bigger one is split before it asks for review: a review that takes longer than the PR
  took to write is the sign.
- **Short-lived.** Opened, green and reviewed within a day. A PR nobody has pushed to for
  three days is finished, handed over (`handoff`) or closed; one whose files `main` has
  rewritten since is redone from its plan item on a fresh `main` rather than merged
  forward through the conflicts.
- **`main` comes in once, just before review**, not on every new commit to `main`: each
  merge of `main` re-runs the Mac shards and can conflict. Merge it as the last push of
  the work, so the head that turns green (and is reviewed) already contains it. After
  that, `main` moving on is no reason to merge it again (the owner, 2026-09-28): only a
  conflict is.

## The PR body is the handoff note

Every PR from either tool keeps this block up to date in its body. It is what the next
session reads instead of the conversation that wrote it:

```
Plan item: 0-tap (PLAN.md §0, Order of work 0.3)
Done: what changed, in a sentence or two
Measured: the npm scripts run, where they ran (Mac GPU / cloud / CI) and the numbers
Controls: each check-skeptic control run and what it read (red where it should be)
Review owed: before-merge, sampled or none, then why and what was only done by hand
Check changes: "none", or one list line per change to a check's bar or input (below)
Left: the next concrete step, if the work stops here
```

Two of these lines are read by programs, so keep their shape: `Plan item:` starts a
line and is followed by the item's id and a space (`ready.yml` copies the id into its
`READY` line), and `Review owed:` starts with one of `before-merge`, `sampled` or `none`
(which PRs owe which is under "Ready, review, merge" below).

**Check changes.** CI fails a PR that moves what a check measures against or with and does
not say so (`npm run checkguard`, the "Check changes named" job, under the required
`Measure`; PLAN.md 19x). That is any number a check compares against (`>= 0.05` to
`>= 0.04`), a comparison turned round, a check or its bar deleted or rewritten, any other
number on a code line under `scripts/` (a stir strength, a seed, a duration, a run count,
where a drop is poured, a `?stir=0.3` in a URL), and a SHOUTING_CASE number constant under
`src/gpu/` (WGSL too), or anywhere in `src/` that a script names, that changes value, is
renamed or goes (`ROCK_FALL`, which a check reads through the app). Comments, check names, log text and
`toFixed` digits never count. So does a check turned to assert the opposite (a `>` that
becomes `<`, a name that gains "does not" or "negligible" as its condition changes), and
that one is read in every commit of the PR, not only against main: #357 turned two of its
own new checks of dye streaking into checks that nothing streaks, which would pass with the
feature deleted. Name a flip with the word "turned", "inverted" or "opposite" and why the
feature now predicts no effect. Each change gets one list line under `Check changes:` with
the file (or the constant), the old and the new number, and the reason, which is the
measurement that says why it moves:

```
Check changes:
- scripts/rides.mjs:518 heavyTilt.moved >= 0.05 → 0.04: the corners outside the dish no longer count; heavy red measured 0.0474 in the dish
- ROCK_FALL 12 → 13 (src/gpu/fluid.ts): Δρ/ρ re-derived for the dye's real density, 0.0012 not 0.0011
```

A red guard prints these lines with the reason left for you; paste them into the body, write
the reasons, and re-run the failed jobs (no push needed). A named change passes; it is the
reviewer who judges the reason, and the owner's rule still holds: a bar is never loosened to
get green. If the check is red, find why the plate fails it. Changing a test's input needs
the physics that justifies it, checked against the old input.

## Leaving a record

Claude Code sessions cannot see your terminal, the owner's consoles or the repo's
settings; they only see GitHub. Anything done outside a PR that a Claude session might
otherwise list as still owed has to be written down, or it gets done twice or chased for
weeks (the Firebase secrets and the privacy-page details on #390 were finished this way
and Claude still listed them as open).

Within the same day, for each of these, leave a comment on the related PR or issue, or,
when there is no PR, a line in `PLAN.md`'s status table:

- a repo secret, variable or setting you set or changed (name it, never its value);
- another PR's body, labels or files you edited, and why;
- a Firebase, Cloudflare, Apple or other console step the owner did with you;
- a claim, handoff or stop you did not already put in a PR body.

One or two lines is enough: what, where, when, and what is now no longer owed.

## Stopping halfway

When a session runs out of credit mid-task: push what it has, even if it is red, fill in
`Left:` with the very next step, and add the `handoff` label. The other tool picks it up
with `gh pr checkout <n>`, reads the PR body and the one `PLAN.md` section, then removes
the label and carries on in the same PR.

## What Antigravity does in place of `.claude/`

Antigravity reads `CLAUDE.md` (through `AGENTS.md`) and follows each agent's and skill's
instructions by hand:

- **check-skeptic**: runs the controls itself. It writes the mutants in its own scratch
  space, runs each one, restores the tree and pastes the results under `Controls:`. A
  check is not changed without this.
- **prepush-reviewer**: reads its own diff against the list in that file and runs
  `npm run lint` plus whatever the "Which checks for which files" table in `CLAUDE.md` asks
  for.
- **steward, ship**: followed step by step. Merging is under "Ready, review, merge"
  below: a PR that owes no review before merge is merged by Antigravity as soon as CI
  is green on the head, without asking; one that owes a review is merged by the
  reviewer on its `PASS`. The PR is marked ready, it is squash-merged, the deploy is
  watched to green and reported in Pacific time, and the branch is restarted from
  `main`. The squash body ends with `Co-Authored-By: Antigravity <noreply@google.com>`.

Doing these by hand is close to the real thing but not the same. So every Antigravity PR
that changes a check, or anything under `src/`, carries the `review-owed` label and names
under `Review owed:` what was only done by hand.

## Ready, review, merge

Each hop between the tools used to wait on someone noticing: the Mac watcher seeing a run
go green and telling the coordinator, the coordinator starting a review, the review's
verdict reaching Antigravity. On 2026-10-24 the watcher's wait died and two green PRs sat
unnoticed for two hours. Every hop is now a label or a comment on the PR, which anything
subscribed to it wakes on, and every hop names the commit it is about, so nothing is
reviewed or merged on a head that has moved since.

**Which PRs owe a review before merge** (`Review owed: before-merge`, label
`review-owed` from the moment the PR opens):

- physics and taste: `src/gpu/`, WGSL, how a liquid, tool or look behaves;
- anything that changes a check or moves a bar or input (`Check changes:` not "none");
- sign-in, keys, payments, licences and the Workers under `server/`;
- any class the owner has put back on review before merge after an escape (since
  2026-10-18, every Antigravity PR, until 2026-10-25).

Other changes under `src/` (UI and its phone version, settings plumbing, layout, ports)
are `Review owed: sampled` and also carry `review-owed`: they merge on green and Claude
Code reviews some after merge (below). Docs and `PLAN.md` alone are `none`.

**1. Green.** When `Checks` finishes green on an Antigravity PR's head (or any PR
labelled `review-owed`), `.github/workflows/ready.yml` adds `ready-for-review` and posts
one comment whose first line is

```
READY #355 18e head 5e68d109ba9b...
```

with the head's full 40-character commit. A push takes the label off again, and so does a
red run of the head. Do not post a `READY` line by hand: one that a program writes from
the run itself cannot claim a head that was never green. A `READY` line reading `none`
for the item means the body has no `Plan item:` line; fix the body.

Antigravity's own summary comment at the end of each run (the record `AGENTS.md` asks for)
starts with `Pushed #<n> <item> head <sha>`, so a session reading the PR knows which
commit the run left behind before CI has finished with it.

**2. Review.** A Claude Code session takes the ready PRs that owe a review before merge
in one pass, oldest first, three at most per session:
`gh pr list --label ready-for-review --label review-owed`. It reviews the head the
`READY` line names, as under "Claude Code's review pass" below, and posts one comment
whose first line is the verdict:

```
PASS #355 head 5e68d109ba9b...
CHANGES #355 head 5e68d109ba9b...
```

then the numbered list for `CHANGES` (most important first; each with `file:line`). On a
`PASS` it removes `review-owed`. If the head moved while it read, it says which head it
reviewed and does not pass the new one.

**3. Fix.** Antigravity fixes the numbered list and pushes; the next green brings a new
`READY` line, and the re-review reads only what changed since the head it sent back,
leaving out merges of `main`: `git log -p --no-merges <reviewed>..<new head>`. A whole
second review happens only when that diff goes beyond the list.

**4. Merge.** A before-merge PR is merged by the Claude Code session that passed it,
straight after its `PASS` (the owner, 2026-10-24): a `PASS` used to wait for
Antigravity's next run, and Antigravity can be out of credit for a day or more. The merge
is pinned to the head the `PASS` names, so a push in between refuses it:

```
gh pr merge <n> --squash --match-head-commit <the head the PASS names>
```

(`merge_pull_request` with `expectedHeadSha` from a cloud session.) The squash body keeps
`Co-Authored-By: Antigravity <noreply@google.com>` and names no model. The reviewer then
watches the deploy to green and reports it in Pacific time on the PR; Antigravity's next
run restarts its branch from `main`. If `Checks` is not green on that head when the
`PASS` is written, the `PASS` says so and the merge waits for the `READY` line.

A PR that owes no review before merge (`sampled` or `none`) is merged by Antigravity
the same way, pinned to its green head. A clean merge of `main` after a `PASS` (no
conflict to resolve) needs no new review, only the green; a merge that resolved a
conflict does, of the resolution alone.

## Claude Code's review pass

The `PASS`/`CHANGES` verdict above for PRs that owe one before merge, and a sampled pass
after merge for the rest. The steps are the same.

**When.** At the start of a Claude Code session, before taking new work, run
`gh pr list --label ready-for-review --label review-owed`: those are waiting on a review
before they can merge, and come first (three at most per session). Then
`gh pr list --state merged --label review-owed --limit 5`: if anything is listed, review
the **oldest one** in this session and leave the rest for the next. That keeps the sampled
pass to roughly one PR per session, which is the "occasionally" the owner asked for. If
nothing is labelled but five or more `antigravity/` PRs have merged since the last review
comment, pick one of them at random instead.

**What, in this order, stopping at the first real problem:**

1. Read the PR's `Check changes:` lines first (the guard makes every moved bar and input
   list itself there). A loosened bar, or an input changed without the physics behind it,
   is the first problem to name.
2. `check-skeptic` on every check the PR added or changed. Run its controls again
   rather than trusting the ones pasted in the PR body; if they cannot run here (they need
   a GPU), check that the pasted ones mutate what they claim to.
3. `prepush-reviewer` on the PR's diff (`git diff <base>...<head>`, or the squash
   commit's parent for a merged PR).
4. The one or two `npm run` scripts named under `Measured:` that can run where the session
   is (the table in `CLAUDE.md`).

**Then.** Leave one comment on the PR whose first line is the verdict (`PASS #<n> head
<sha>` or `CHANGES #<n> head <sha>`, as above), then one line per step: what was run,
what it read, and "holds" or the problem with `file:line`. On a `PASS`, remove
`review-owed`.
If a problem is found and the PR is still open, describe it in the comment; fix it on the
branch only if the PR carries `handoff` or Antigravity has gone quiet on it for a day. If
the PR has already merged, the fix is a new PR in the usual way, naming the reviewed PR.

**Budget.** Up to three before-merge reviews and one sampled pass per session, and none
on a session the owner started for something urgent. A review that would take longer than the PR took to write is a sign the PR was too
big; say so in the comment rather than finishing it.
