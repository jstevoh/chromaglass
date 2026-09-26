---
name: steward
description: Drive a ChromaGlass pull request to green. Use when CI on a PR is red, when a check-run failure event arrives, or before asking for a merge. Finds every failure in the run, maps each to its script, reproduces what can be reproduced, fixes the cause, and pushes once.
---

# Steward: a red PR to green

The rule this repo is built on: **a check is never loosened, skipped or deleted
to get green.** Either the code is wrong or the check measures the wrong thing,
and which one it is gets found, written down in the commit, and fixed.

## 1. Get every failure, not the first

A run can have several. Pull the logs of **every** failed job (the macOS job is
sharded: check each shard) and collect:

- every line containing `FAIL`, with the three lines before it;
- every `##[error]` line;
- the step each came from (the step name maps to a script: see
  `.github/workflows/checks.yml`).

A long log is best read by a subagent told to quote the `FAIL` lines verbatim.

## 2. Sort each failure

| Kind | How to tell | What to do |
|---|---|---|
| **This PR broke it** | The failing claim touches code in the diff | Fix the code |
| **The check is wrong** | It reads NaN, null or 0 for everything; or it asserts a moment of the plate rather than the feature | Fix the check so it measures the feature, and say why in a comment above it |
| **Red on `main` too** | The same check fails on main's last deploy run | Port the fix if one exists; otherwise one PR comment naming the check, why it is not this PR's, and the proposed patch |
| **Margin** | A value at or just past its limit, passing on the next commit | Look at the spread over the last runs before touching the limit; it is drift noise only if it is |

Seen before, and the first thing to check:

- **NaN everywhere**: a `page.evaluate` that uses `window.__cgFrame(...)`
  without `await` (it returns a promise).
- **"every command the code tells you to run"**: a comment in `src/` or
  `scripts/` says `npm run <x>` for an `<x>` that is not a script, often a
  trailing colon.
- **Hit targets / text size** (`qa`, "nothing is smaller than 24px"): a new
  button or clickable span under 24px tall.
- **Something moved that should not** (the mode switch): a `1fr` grid column
  grown by content that cannot shrink; use `minmax(0, 1fr)` and let the
  content give way.
- **The plate gained or lost dye by itself**: measure the untouched plate
  before *and* after, and judge against the larger drift.

## 3. Reproduce, fix, prove

- Reproduce locally what can be (see the table in `CLAUDE.md`: the app's frames
  cannot be read in a cloud session; layout, node harnesses and the lab can).
- For a check that can only run in CI, reason from the log and from the
  check's own source, and say in the commit that it was verified by reading, not by running.
- Run the fast checks for the files you touched (`CLAUDE.md`, "Which checks
  for which files"), then the `prepush-reviewer` agent on the diff.
- **One push with every fix in it.** A push restarts a run that takes minutes.

## 4. Report

- Commit message: which check, what it read, why, what changed, what it reads now.
- If a failure is not this PR's: one comment on the PR, never silence.
- Tell the user in plain words what was failing and whether it was the product
  or the test.
