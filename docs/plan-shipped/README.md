# The plan's shipped stories, one file a section

How each shipped item of the plan was found, built and measured. The open plan is
`PLAN.md` (the index) and [`docs/plan/`](../plan/README.md), one file a section; this
folder mirrors it, one file a section under the same name, and an item keeps a one-line
stub in its open file naming its id here. A section over about 36 KB is cut between items
into parts (`-2`, `-3`, …), each under the 40 KB at which `npm run sizes` warns. Until 19m-3
(2026-10-29) this was one file, `docs/plan-shipped.md`, of about 750 KB.

**When an item ships**, its story goes at the end of its section's last file here, under a
`## Shipped after the split` heading (the first story to need it adds it), as
`### <id>. <title>`, and its open file keeps the stub. Never rewrite a story here: later
items and the code's comments cite them.

A branch that edited the old `docs/plan-shipped.md` merges main and runs
`node scripts/planmove.mjs` (`--dry` first): it carries the branch's own archive hunks
into these files, as it carries an old `PLAN.md`'s into `docs/plan/`.

## How the stories came here

Each file keeps them under the pass that moved them, in this order.

**First pass (2026-10-04).** Moved here from `PLAN.md` on 2026-10-04, so that a session
reads only the work that is still open (`PLAN.md` had grown to 4,462 lines, about 40k
tokens, and a session pays for whatever it reads on every step after). Each batch is kept
whole, with its measurements and the reasons behind each choice, because later items and
the code's comments cite them ("batch 3's gate", "the 4–8 px structure"). The section
numbers are `PLAN.md`'s; each one there keeps a stub saying it shipped, and any item still
open in it.

**Second pass (2026-10-04).** The shipped parts of the sections that were still whole in
`PLAN.md`: sections 0, 5 and 9 to 25. Each heading here repeats the one in `PLAN.md`,
where a stub says what shipped and the open work stays. A section split in both passes has
stories under both.

**Third pass (2026-10-29, 19m).** When `PLAN.md` became an index with one file a section
under `docs/plan/` (19m), the stories of the items marked shipped moved here whole, each
under its section, and each left a one-line stub in its file. An item that shipped with
open work found along the way kept that work where it was: only the story above it moved.
Nothing was cut.

**Fourth pass (2026-10-29, 19m-2).** The third pass moved items whose title said they had
shipped. It left the stories of shipped work told inside items still open: a "Done:"
account in the middle of an open item, a struck sub-bullet with its whole build story, a
section's opening paragraphs on what had already landed. A reader went through each
section once and moved those here whole, under the section and the id the stub in the open
file names; the open work, the questions still waiting and the reasons that steer it
stayed where they were. 28f and 28g, written twice in §28, were folded into their longer
versions there, and the older short versions are kept here as they were.

**The split (2026-10-29, 19m-3).** The one file cut into these, nothing reworded but the
headings' depth (a second-pass section heading and the fourth pass's stray `##` stubs sit
one level down) and five stories that two passes both told (14v-7, 14ab-8, 14y, 27a-8,
35c-2), now told once each, the later copy's few facts the earlier lacked written into it; and
the end of a sentence in 15i's story that the open plan had kept is back with its start.

## The files

| File | Section | KB | A part begins at |
|---|---|---|---|
| [00-dye-tools.md](00-dye-tools.md) | §0 | 21 |  |
| [01-sharp-liquid.md](01-sharp-liquid.md) | §1 | 5 |  |
| [02-lacing.md](02-lacing.md) | §2 | 2 |  |
| [03-drops.md](03-drops.md) | §3 | 8 |  |
| [04-liquids.md](04-liquids.md) | §4 | 7 |  |
| [05-playing-it.md](05-playing-it.md) | §5 | 3 |  |
| [06-render-a-song.md](06-render-a-song.md) | §6 | 4 |  |
| [07-room-camera.md](07-room-camera.md) | §7 | 6 |  |
| [08-desk.md](08-desk.md) | §8 | 35 |  |
| [09-ferrofluid.md](09-ferrofluid.md) | §9 | 22 |  |
| [10-playing-like-a-show.md](10-playing-like-a-show.md) | §10 | 19 |  |
| [11-mixer.md](11-mixer.md) | §11 | 27 |  |
| [13-vj-software.md](13-vj-software.md) | §13 | 12 |  |
| [14-show-at-the-gig.md](14-show-at-the-gig.md) | §14 | 25 |  |
| [14-show-at-the-gig-2.md](14-show-at-the-gig-2.md) | §14 | 31 | 14v |
| [14-show-at-the-gig-3.md](14-show-at-the-gig-3.md) | §14 | 37 | 14aa |
| [14-show-at-the-gig-4.md](14-show-at-the-gig-4.md) | §14 | 18 | 14ad |
| [15-tools-on-liquids.md](15-tools-on-liquids.md) | §15 | 26 |  |
| [16-many-plates.md](16-many-plates.md) | §16 | 7 |  |
| [18-physics.md](18-physics.md) | §18 | 28 |  |
| [18-physics-2.md](18-physics-2.md) | §18 | 27 | 18d |
| [18-physics-3.md](18-physics-3.md) | §18 | 26 | 18l |
| [19-checks-build-plan.md](19-checks-build-plan.md) | §19 | 30 |  |
| [19-checks-build-plan-2.md](19-checks-build-plan-2.md) | §19 | 36 | 19v |
| [19-checks-build-plan-3.md](19-checks-build-plan-3.md) | §19 | 30 | 19aa |
| [19-checks-build-plan-4.md](19-checks-build-plan-4.md) | §19 | 25 | 19x-3 |
| [20-lace-and-holes.md](20-lace-and-holes.md) | §20 | 5 |  |
| [21-painters.md](21-painters.md) | §21 | 4 |  |
| [22-spin.md](22-spin.md) | §22 | 11 |  |
| [23-selling.md](23-selling.md) | §23 | 32 |  |
| [24-modular-rigs.md](24-modular-rigs.md) | §24 | 4 |  |
| [25-areas.md](25-areas.md) | §25 | 10 |  |
| [26-turing-print.md](26-turing-print.md) | §26 | 15 |  |
| [27-controls-you-see.md](27-controls-you-see.md) | §27 | 28 |  |
| [28-preset-palettes.md](28-preset-palettes.md) | §28 | 29 |  |
| [28-preset-palettes-2.md](28-preset-palettes-2.md) | §28 | 23 | 28j-1 |
| [29-ferro-drop.md](29-ferro-drop.md) | §29 | 28 |  |
| [30-sound-and-midi.md](30-sound-and-midi.md) | §30 | 4 |  |
| [32-soap-film.md](32-soap-film.md) | §32 | 17 |  |
| [33-bubbles-closeup.md](33-bubbles-closeup.md) | §33 | 15 |  |
| [34-photism.md](34-photism.md) | §34 | 6 |  |
| [35-clear-controls.md](35-clear-controls.md) | §35 | 34 |  |
| [36-analog-operators.md](36-analog-operators.md) | §36 | 5 |  |
| [37-marketing.md](37-marketing.md) | §37 | 6 |  |
| [qa.md](qa.md) | QA | 12 |  |
