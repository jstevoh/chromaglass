---
paths:
  - "scripts/**"
  - "scripts/checks.json"
---

# checks, harnesses, and the manifest

- **Never loosen, skip or delete a check to get green.** Find why it is red.
- A check asserts the *feature*, not a moment of the plate: see the long comments in
  `scripts/qa.mjs` for how many "flakes" were a check measuring the wrong thing.
- A new or changed check: run that check and `.claude/agents/check-skeptic.md` (find the ways
  a new or changed check can pass while measuring nothing; the rules in `docs/roadmap.md`). A
  new check is an entry in `scripts/checks.json` (its shard, its command, why), never a step
  in `.github/workflows/checks.yml`.
- A check's bar or input under `scripts/`: name each under `Check changes:` in the PR body
  (`docs/handoff.md`), or `Measure` is red.
- The `panel` check greps the source for `npm run <name>` and fails if `<name>` is not a
  script. Write "`npm run qa`" in a comment, never "npm run qa:".

## What can be verified where

| Where | Can verify | Cannot |
|---|---|---|
| A cloud session (no GPU; Chromium with SwiftShader) | `npm run lint`, `wgsl`, the node harnesses (`plate`, `desk`, `panel`, `pops`, `setlist`, `music`, `liquids`, …), the lab (`physics`, `straw`, `microscope`, `ferrolook`, `maze`, `spikes`, `fingers`, `ferrohands`, `domes`, `ferrodye`, `ferropour`, `regrid`, `particles`, `derive`, `mixer`, `disc`), the Mac app's `desktop` (under xvfb, all but its lit plate and hidden-window lines), `codecblip` (the recorder's encoder, by hand) and DOM/layout checks in a browser | The **app's** numbers: with `PW_WEBGPU=1` the app runs headed under Xvfb and its frames read back (PLAN.md 19l), but at about 0.4 solver steps a second against Metal's sixty, so `tools`, `magnet`, `mirror`, `bottles`, `take`, `ferro`, `ferrodrift`, `finger`, `bubbles`, `depth`, `handpour`, `kickbubbles` run their logic on a twentieth of the steps (`settlePlate` in `scripts/frame.mjs`) and not their magnitudes; `qa`, `gallery`, `moving`, `film` are still the Mac's |
| CI, macOS runner (Metal) | Everything | — |
| The owner's machine | How it looks at 60 fps | — |
