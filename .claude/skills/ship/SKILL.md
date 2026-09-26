---
name: ship
description: Merge a green ChromaGlass PR, confirm the Firebase deploy, report it in Pacific time, and restart the working branch from main. Use when the user asks to merge, deploy or ship, or when a PR the session owns is green and the user has authorised merging.
---

# Ship: from a green PR to the live site

## Before merging

- CI green on the PR's **current head** (every shard of `WebGPU (macOS)`, and
  `Measure`), no merge conflict, no open review thread waiting on us.
- The user has said to merge (in this conversation, or a standing instruction).
- The PR body describes what is in it, in plain words, including anything added
  since it was opened.

## Merge and deploy

1. Squash-merge. The title is the PR's; the body is a short summary, and it
   ends with the repo's attribution lines.
2. The merge starts `Deploy to Firebase Hosting` on `main`, which runs the
   checks again, then builds and deploys. Watch that run, not the PR's.
3. If the deploy's checks fail, the site did not change: treat it as a red PR
   (the `steward` skill), on a fresh branch from `main`.
4. When `Build and deploy` is green, report: what shipped, the commit, and the
   time **in Pacific time** (PDT is UTC−7, PST UTC−8).

## After

- Restart the branch the work was on from `main`:
  `git fetch origin main && git checkout -B <branch> origin/main`, then
  `git push --force-with-lease -u origin <branch>`. Never stack new work on a merged PR's history.
- Unsubscribe from the merged PR; open a new draft PR for the next batch when
  there is one.
- If `docs/roadmap.md` or `PLAN.md` tracks what shipped, update its state line.
