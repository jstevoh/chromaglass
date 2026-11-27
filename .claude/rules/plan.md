---
paths:
  - "PLAN.md"
  - "docs/plan/**"
---

# reading and updating the plan

Before starting anything that is not a bug fix, read `PLAN.md`: it is the plan's index
(about 80 KB): **This week** first (the ranked list the owner set, 2026-11-21: beautiful
visuals and real physics), then the **Order of work** (the standing order, which lanes are
parked this week), the running order, and a table of the sections. Then read only the file
your step names: each section is a file under `docs/plan/` (`00-dye-tools.md` to
`48-ideas-visuals.md`, a big one cut between items into parts of about 30 KB), and
`grep -rn '14ab-4' docs/plan/` finds an item from its id. Never read every section: the open
plan is about 900 KB in all, and see "Keeping a session small" in `CLAUDE.md` for why that
matters. The section files hold only open work. Closed items are in `docs/plan/archive/` under
the same file names, and stories from before 2026-11-21 in `docs/plan-shipped.md`, under the
same numbers: read them only when an open item needs the history behind it. When an item
ships, mark it shipped where it stands and run `node scripts/planarchive.mjs`, which moves it
to the archive (19m-5). A branch that still edits the old one-file `PLAN.md` carries its
edits across with `node scripts/planmove.mjs` after merging main (19m). The engine's own
order is in `docs/roadmap.md`. `docs/judging.md` lists what needs the owner's eyes on a real
GPU.

Every PR updates the plan: what it shipped marked shipped in its section file under
`docs/plan/` (and its row in `PLAN.md`'s running order; `node scripts/planarchive.mjs` then
moves it to the archive), and anything found along the way that needs fixing or adding
written in as an item in the section it belongs to.
