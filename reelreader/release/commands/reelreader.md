---
description: Watch a video link or file with reelreader and say how it looks and moves
argument-hint: <link or file> [--vs REF] [--before A --after B] [--batch FOLDER]
---

Watch $ARGUMENTS with the reelreader skill: run
`node "${CLAUDE_PLUGIN_ROOT}/bin/reelreader.mjs" $ARGUMENTS --out <a temp folder>`, then read
what it made in the order the skill gives (Footage and Read as first, then the timeline,
the sheets, the summary), follow its honesty rules, and give the account for the person
asking. Hand them the run's `report.html`.
