# Two tools on one repo: handing work across

Sessions on this repo come from two tools: Claude Code (branches `claude/…`) and
Antigravity (branches `antigravity/…`). Whichever one has credit carries on with the plan,
and when both do, they split it by lane. Everything in `CLAUDE.md` applies to both.
This file covers only what two tools need on top of it: how one claims work, how it hands
work over, and how Claude Code checks what Antigravity shipped, since Antigravity cannot
run the agents and skills in `.claude/`.

GitHub holds all the shared state. Neither tool can see the other's conversation, so a
handoff that is not in a branch, a PR or `PLAN.md` never happened.

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

## The PR body is the handoff note

Every PR from either tool keeps this block up to date in its body. It is what the next
session reads instead of the conversation that wrote it:

```
Plan item: 0-tap (PLAN.md §0, Order of work 0.3)
Done: what changed, in a sentence or two
Measured: the npm scripts run, where they ran (Mac GPU / cloud / CI) and the numbers
Controls: each check-skeptic control run and what it read (red where it should be)
Review owed: the .claude agents only followed by hand, or "none"
Left: the next concrete step, if the work stops here
```

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
- **steward, ship**: followed step by step. A merge needs CI green on the current head,
  as `ship` says, and the owner's go-ahead in the Antigravity conversation.

Doing these by hand is close to the real thing but not the same. So every Antigravity PR
that changes a check, or anything under `src/`, carries the `review-owed` label and names
under `Review owed:` what was only done by hand.

## Claude Code's review pass

A light pass, not a gate. Antigravity PRs merge when green, as any PR does. This pass is
how a second pair of eyes still sees them.

**When.** At the start of a Claude Code session, before taking new work, run
`gh pr list --state all --label review-owed --limit 5`. If anything is listed, review the
**oldest one** in this session and leave the rest for the next. That keeps the pass to
roughly one PR per session, which is the "occasionally" the owner asked for. If nothing is
labelled but five or more `antigravity/` PRs have merged since the last review comment,
pick one of them at random instead.

**What, in this order, stopping at the first real problem:**

1. `check-skeptic` on every check the PR added or changed. Run its controls again
   rather than trusting the ones pasted in the PR body; if they cannot run here (they need
   a GPU), check that the pasted ones mutate what they claim to.
2. `prepush-reviewer` on the PR's diff (`git diff <base>...<head>`, or the squash
   commit's parent for a merged PR).
3. The one or two `npm run` scripts named under `Measured:` that can run where the session
   is (the table in `CLAUDE.md`).

**Then.** Leave one comment on the PR headed `Review pass`, with one line per step: what
was run, what it read, and "holds" or the problem with `file:line`. Remove `review-owed`.
If a problem is found and the PR is still open, describe it in the comment; fix it on the
branch only if the PR carries `handoff` or Antigravity has gone quiet on it for a day. If
the PR has already merged, the fix is a new PR in the usual way, naming the reviewed PR.

**Budget.** One PR per session, and none on a session the owner started for something
urgent. A review that would take longer than the PR took to write is a sign the PR was too
big; say so in the comment rather than finishing it.
