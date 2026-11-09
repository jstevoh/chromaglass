# The plan, one file a section

`PLAN.md` at the root is the index: the order of work, the running order and the rules,
and a table of these files. Each file here is one section of the plan (a big one cut
between items into parts), with only its open work and the stubs of what shipped; the
stories of shipped items are in `docs/plan-shipped.md`, under the same numbers.

## Where the old PLAN.md went

Until 19m (2026-10-29) the plan was one file of about 820 KB. A branch that still edits
the old `PLAN.md` (based on main at or before `5558fd6`) merges main, and on the conflict
runs `node scripts/planmove.mjs`: it finds each of the branch's own hunks in the new files
(the lines moved as they were, only a heading's level changed) and applies it there, takes
main's index as `PLAN.md`, and prints any hunk it could not place (`--dry` to look first).
Such a hunk goes in the file its old line falls in:

| Old lines | Now |
|---|---|
| 1–47 | the old header (Gemini and Claude tracks), retired: `docs/plan-shipped.md`, "The plan's old header" |
| 48–314 | `PLAN.md`, Order of work (and its table, One home for work written twice) |
| 315–537 | `docs/plan/qa.md` |
| 538–577 | `PLAN.md`, Running order |
| 578–865 | `docs/plan/00-dye-tools.md` |
| 866–945 | `docs/plan/01-sharp-liquid.md` |
| 946–949 | `docs/plan/02-lacing.md` |
| 950–953 | `docs/plan/03-drops.md` |
| 954–998 | `docs/plan/04-liquids.md` |
| 999–1117 | `docs/plan/05-playing-it.md` |
| 1118–1136 | `docs/plan/06-render-a-song.md` |
| 1137–1140 | `docs/plan/07-room-camera.md` |
| 1141–1344 | `docs/plan/08-desk.md` |
| 1345–1694 | `docs/plan/09-ferrofluid.md` |
| 1695–2082 | `docs/plan/10-playing-like-a-show.md` |
| 2083–2439 | `docs/plan/11-mixer.md` |
| 2440–2471 | `PLAN.md`: Not doing, What comes next, Operating rules |
| 2472–2592 | `docs/plan/12-app-stores.md` |
| 2593–2912 | `docs/plan/13-vj-software.md` |
| 2913–3973 | `docs/plan/14-show-at-the-gig.md` |
| 3974–4403 | `docs/plan/15-tools-on-liquids.md` |
| 4404–4484 | `docs/plan/16-many-plates.md` |
| 4485–4529 | `docs/plan/17-hear-ahead.md` |
| 4530–5297 | `docs/plan/18-physics.md` |
| 5298–6514 | `docs/plan/19-checks-build-plan.md` |
| 6515–6769 | `docs/plan/20-lace-and-holes.md` |
| 6770–6829 | `docs/plan/21-painters.md` |
| 6830–6900 | `docs/plan/22-spin.md` |
| 6901–7363 | `docs/plan/23-selling.md` |
| 7364–7495 | `docs/plan/24-modular-rigs.md` |
| 7496–7634 | `docs/plan/25-areas.md` |
| 7635–7765 | `docs/plan/26-turing-print.md` |
| 7766–8085 | `docs/plan/27-controls-you-see.md` |
| 8086–8594 | `docs/plan/28-preset-palettes.md` |
| 8595–8829 | `docs/plan/29-ferro-drop.md` |
| 8830–8961 | `docs/plan/30-sound-and-midi.md` |
| 8962–9061 | `docs/plan/31-optics-and-wall.md` |
| 9062–9220 | `docs/plan/32-soap-film.md` |
| 9221–9351 | `docs/plan/33-bubbles-closeup.md` |
| 9352–9458 | `docs/plan/34-photism.md` |
| 9459–9632 | `docs/plan/35-clear-controls.md` |
| 9633–9834 | `docs/plan/36-analog-operators.md` |
| 9835–9839 | `docs/plan/23-selling.md`, at its end |

A hunk inside a shipped item's story goes to `docs/plan-shipped.md` under "Moved in the
third pass"; the stub in the section file names the item.
