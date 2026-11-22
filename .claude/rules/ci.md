---
paths:
  - ".github/**"
  - "scripts/checks.json"
  - "scripts/reach.mjs"
  - "scripts/deploygate.sh"
---

# CI and the Mac runner

`checks.yml` runs on every PR and before every deploy: `Measure` (ubuntu, thirteen parts)
and `WebGPU (macOS)` (Metal, sharded). **A PR runs only Measure's `logic` and `sound` (the
typecheck, the build, the node harnesses) and no Mac shard; the browser, lab and Mac checks
run on main's deploy only** (PLAN.md 19ak-20, the owner, 2026-11-22). So before pushing a
change the plate draws, run its lab or harness yourself (`npm run quick`, the `look`
skill). What each part runs is `scripts/checks.json`; what a PR runs is
`scripts/reach.mjs`; when a deploy trusts a PR's run, or skips the
checks, is `scripts/deploygate.sh` (which since 19ak-21 only decides whether a deploy
publishes anything and whether its after-the-fact checks run); the owner's Mac takes main's
deploy shards when idle and never a PR's (`docs/mac-runner.md`). The whole account is
`docs/ci.md`; read it when a run or a deploy needs explaining. When CI is red, use
`.claude/skills/steward/` (drive a red PR to green).
