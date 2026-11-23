---
paths:
  - "server/**"
---

# accounts, keys, tierGates, and review-owed

- Only the accounts code touches keys and tokens; everything else asks `tierGates`.
- Sign-in, keys, payments, licences, the Workers under `server/` and security changes owe a
  Claude Code review before merge (since 2026-11-15; label `review-owed`,
  `Review owed: before-merge` in the PR body; see `docs/handoff.md`, "Ready, review, merge").
- `.claude/skills/crash-triage/`: turn a crash report or the report Worker's digest into a
  cause, a reproduction and a fix (`docs/crash-plan.md`).
