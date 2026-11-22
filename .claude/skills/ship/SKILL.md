---
name: ship
description: Merge a green ChromaGlass PR, confirm the Firebase deploy, report it in Pacific time, and restart the working branch from main. Use when the user asks to merge, deploy or ship, or when a PR the session owns is green and the user has authorised merging.
---

# Ship: from a green PR to the live site

## Before merging

- CI green on the PR's **current head**: `Measure` (a PR runs only its `logic` and
  `sound` parts, and no Mac shard, since PLAN.md 19ak-20), no merge conflict, no
  open review thread waiting on us. Main moving during the run is fine; merge
  main in only to resolve a conflict.
- The PR's `Main not held red` status is green (`scripts/mainhold.mjs`, PLAN.md 19am).
  Red means the same check is red on main's last two deploys: only a PR labelled
  `fixes-main` merges until a deploy is green, and that label goes only on the fix.
  This holds even under the standing rule that known runner-flake reds do not block.
  No status at all is not a pass: run `workflow_dispatch` on `hold.yml` (Main hold) and
  read it again.
- The user has said to merge (in this conversation, or a standing instruction).
- The PR body describes what is in it, in plain words, including anything added
  since it was opened.

## Merge and deploy

1. Squash-merge. The title is the PR's; the body is a short summary, and it
   ends with the repo's attribution lines.
2. The merge starts `Deploy to Firebase Hosting` on `main`. Since PLAN.md
   19ak-21 its `Build and deploy` job runs as soon as the gate answers (a few
   minutes), and the browser, lab and Mac checks run beside it as a report.
   Watch the `Build and deploy` job, not the run's overall result.
3. If that run's checks go red, the site has already changed: the bug is live.
   Fix it on a fresh branch from `main` (the `steward` skill); a newer merge
   cancels the older run's checks.
4. When `Build and deploy` is green, report: what shipped, the commit, and the
   time **in Pacific time** (PDT is UTC−7, PST UTC−8).

## After

- Restart the branch the work was on from `main`:
  `git fetch origin main && git checkout -B <branch> origin/main`, then
  `git push --force-with-lease -u origin <branch>`. Never stack new work on a merged PR's history.
- Unsubscribe from the merged PR; open a new draft PR for the next batch when
  there is one.
- If `docs/roadmap.md` or `PLAN.md` tracks what shipped, update its state line.
