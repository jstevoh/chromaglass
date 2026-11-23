---
paths:
  - "src/gpu/**"
  - "src/sim/**"
---

# the solver and shaders

- **Physics writes, rendering reads.** The plate shader draws the solver's fields and never
  fakes a motion, mixing or surface effect the solver should produce. Sound moves the plate
  only through cords and preset patches.
- **No ceremony in the frame.** In the frame loop and the solver, plain functions over
  typed arrays and refs; no new per-frame objects, classes or wrappers. A frame-loop change
  first moves its piece to its own module (19ai-10).
- A `SHOUTING_CASE` number in `src/gpu/` (WGSL too) is watched by `checkguard`: name each
  moved, renamed or removed constant under `Check changes:` in the PR body (`docs/handoff.md`),
  or `Measure` is red.
- `PW_WEBGPU=1` gives a harness software WebGPU (`scripts/chromium.mjs`): enough for the lab,
  and for the app's logic at a crawl. For pictures of a change, use `.claude/skills/look/`:
  the lab renders the real plate shader on a deterministic plate.
- `.claude/agents/preset-auditor.md`: photograph every preset and flag the broken ones.
- `.claude/skills/watch/`: watch a video (a reference link, a recording of the app) as
  contact sheets, a slit-scan timeline and motion, colour and sound numbers (`npm run watch`).
- `.claude/agents/video-watcher.md`: watch long or several videos in its own context and
  return an account with numbers, or the app compared against a reference.
