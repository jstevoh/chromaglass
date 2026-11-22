---
trigger: model_decision
description: "Rules for src/components/desk/**, src/components/settings/** and src/types.ts: desks, settings, and setting-auditor. Read before changing those files."
---

Generated from .claude/rules/desks-settings.md by npm run rules; edit that file, not this one.

# desks, settings, and setting-auditor

- Desks change settings and never call GPU code.
- One panel, one kind of control (8d-3). Rides, the Mixer, the Wall panel, the settings
  sheet and the phone draw sliders; the Recipe and every section's knobs panel draw knobs.
  Never pick a control's kind from what it is learned to on a controller.
  `npm run panelkinds` renders every panel and fails a mix.
- A new or changed setting: run `npm run panel`, `npm run desk`, and
  `.claude/agents/setting-auditor.md` (hold a new setting to `PLAN.md`'s operating rules: a
  default that keeps today's look; MIDI, the desks and the phone).
