# 21. Looks after painters: what shipped

How §21's shipped items were found, built and measured. The open work is in
[`docs/plan/21-painters.md`](../plan/21-painters.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 21. Looks after painters

**Shipped: Roy, 1963, and Ben-Day Dots.** A control (`benDay`, Settings → Look, MIDI,
the desks, the remote, and the phone's Looks sheet while a look prints) that reads the
finished picture as a comic printer would: dark is black, anything lit is white paper
with one of three process inks on it (red, yellow, blue, whichever the hue is
nearest), a pale wash is that ink laid as even Ben-Day dots on a 45° screen fixed to
the picture (32 rows down it), and a strong one is the flat ink. The front plate's
shapes are outlined in black from its dye, a pen's width (a ring of taps round each
pixel), and so are the seams where two inks meet. Only Roy turns it up: big flat
pools of the three primaries in thin washes of themselves on a white light table,
milk and ink so the shapes keep their own edges, and nothing that shades (no gloss,
hot-spot, beads, bubbles or closeup texture). `npm run benday` measures the print on
a lab plate: a wash is 242 separate dots against 256 on the lattice, one size to
2.7%, fixed while the plate turns; a pool is one flat ink with a line all the way
round it and a line where red meets yellow; and only Roy prints.

**Shipped: Roy opens as a panel, not a black stain.** The owner, 2026-10-04, over a
screenshot nine seconds in: "The Roy preset always starts with this giant black stain.
Get rid of it. It needs to look more like an abstract colorful Roy Lichtenstein
painting." The stain was the look's seed: `splatBlob` takes its radius in the 128 grid's
units and scales it itself, and Roy's seed handed it cells, so its four pools came out
four to five times too wide, lay over each other across the whole glass, and three inks
over each other print black. The seed is now a laid-out panel in the plate's view: seven
flat shapes and three brushstrokes of the three inks, apart on white paper, and four
even fields of pale wash at the strength each ink prints as Ben-Day dots (measured per
ink, a narrow band: blue about 0.1, yellow and red about 0.12). Dye Budget 0.9 → 0.45, so
the drops cannot fill the plate back into one wash (inferred, 21e). `npm run royopen`
lays the app's own seed and prints it in the lab: on main 71% of the plate absorbing all
three channels, the view 57% black, 37% red, 0% white, yellow and blue, 16 dots, mean
3.69; now 0.1%, 9.9% black, 57% white, red 12.8%, yellow 6.8%, blue 9.8%, 254 dots, mean
0.115. The phone lays the same seed (it is the plate, not a control).

## Fourth pass (moved 2026-10-29, 19m-2)

### 21. Looks after painters

#### 21. Looks after painters (found along the way, for §14b)

*Found along the way (for §14b's owner, not this section's):* on this PR's two Mac
runs, `npm run wall`'s "every refresh's own timestamp was believed" read 2, 4, 4, 5, 5
and then 1, 1, 1, 1, 3 fallbacks across its five two-window cases, while #207's run on
the same base read 0; the same harness in a cloud session reads 0 on this branch, and
the plate's display pipeline compiles in the same time with and without the print
(SwiftShader, 2.0–2.4 s both). `stampFallbacks` is a page-wide total, so one early
fallback turns every later case red, and it did not say which bound tripped. This PR
now counts them apart (`stampMisses`), and the next Mac run said which: 4 to 6, every
one ahead of now, the worst by 2.4 ms in every case, none stale. The draw gate had
believed a stamp only up to 2 ms ahead, on the belief that Chrome never stamps a
refresh ahead of now; it now believes up to one 240 Hz refresh (4.2 ms), which the
gate's 0.6-of-a-refresh margin already treats as the same refresh.
And the line catches a wrongly converted wall
only because the harness opens the wall five seconds after the show (the conversion's
error is that gap, caught by the one-second stale bound); with under a second between
them it would pass. **Fixed:** the harness (`scripts/wall.mjs`) checks its own gap is
over a second (`originGap >= 1000`).
