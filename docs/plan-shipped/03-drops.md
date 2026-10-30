# 3. Drops, not rings: what shipped

How §3's shipped items were found, built and measured. The open work is in
[`docs/plan/03-drops.md`](../plan/03-drops.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## First pass (moved 2026-10-04)

### 3. Drops, not rings

`src/lib/beads.ts`, the bead mask shader

The bead field is the right instinct and already measures well; take it three steps
further, to the second reference frame.

- Each drop carries **its own dye colour**, not just a dark rim.
- **Domed** body with one specular highlight, sized from the lamp's direction.
- **Polygonal flattening** when drops crowd, the way foam packs, instead of staying
  circles that push apart.
- **Compound drops**: a drop that has swallowed a smaller one keeps it visible.

New setting `beadDrops` (0–1) blends from today's dark-rimmed rings to full drops, so
the Fillmore look is unchanged at 0.

**Gate:** on a 2× crop, a 6:1 size range within one cluster, visible highlights, and
flattened contacts between touching drops.

**In progress in #163, and the spec above has moved.** A physics search on 2026-09-26
(`/mnt/project-files/drops/research/bubbles-and-drops.md`, with ray-trace scripts
beside it and reference photographs in `drops/references/`) found that a projector
and a camera see a drop differently, and the bullets above were written from camera
photographs:

- **A projector shows no highlight.** It focuses on the dish, and a drop bends light
  out of the lens's small aperture where its surface is steep. So each drop reads as a
  dark ring round a bright, upright centre: the bright core is
  u\* ≈ NA/(2·n_out·|1 − n_out/n_in|) of the radius, which leaves 60–80 % of a small oil
  drop and about 90 % of an air bubble dark. Nothing is flipped. The flipped,
  shrunk picture inside a drop in the macro photographs is the camera looking
  through it, and belongs to the macro closeup only.
- **The thin gap between the glasses sets the shape.** A drop is a sphere until its
  radius reaches half the gap, then a pancake with a half-cylinder edge. The gap also
  sets how fast drops move (a pancake lags at 2U/(1+λ), a bubble runs ahead) and how
  long a merged drop stays stretched.
- **Walls between unequal drops are arcs** that bulge into the larger drop, and
  junctions fillet like Plateau borders; that replaces "polygonal flattening".
- **Air bubbles are air pockets** (a thick black ring, a clear middle), and soap-film
  colour is faint in transmitted light.

The owner chose "Both": the projector look on the plate and the flipped, many-coloured
lens in the macro closeup. He then asked for the report's other findings to go into
the app in its ranked order, on the same PR. The gate becomes: the size range and
flattened contacts as written, the dark-ring fraction matching the rule above for oil
and for air, and no highlight in a projected look. Batch 2's deferred structure gate
(4 px ≥ 0.9 %, 8 px ≥ 1.2 %) is measured once this lands.

**Built, and waiting on the Mac.** `beadDrops` is in, at zero in every look.
`npm run drops` holds three of the gate's four on a plate a current has crowded,
at the app's 192² grid: a 10:1 size range across one cluster of 84 touching
drops (crowded rings make 11:1, so this is the population's range kept, not
made), every pair pressed a pixel and a half or more into each other meeting
along one straight wall with the dome under a pixel high there, and every
compound drop showing its passenger. Each of those claims was run against the
fault it names (a dome that ignores its walls, a gap down every contact, a
passenger drawn white, the rings' arithmetic touched at 0) and goes red. The
fourth, the highlight, is the shader's, and was later dropped (below: the
photographs have none). On the lab's plate, same
field, rings against drops: structure at 8 px 3.0 % → 4.7 %, and on a 2× crop
0.9 % → 1.7 %, with 4 px 0.5 % → 0.8 %. That lab plate is not the Fillmore
plate batch 2 was measured on, so the 4 and 8 px gate carried here from batch 2
is still to be read on the Mac with `npm run detail`.

Three things the first version got wrong and the check caught. Pressing a pair
in by a share of their combined size pushed small drops past a big one's rim,
and the wall between them landed beyond the small one's middle, so small drops
vanished into big ones; the press is now set by the smaller drop. A current
into one point let a drop swallow everything it was brought, one reaching
thirty-nine cells in twenty seconds; only a drop no bigger than the
population's own big lenses swallows now. And a passenger held forever meant
two drops in five were compound after twenty crowded seconds; they dissolve.

**Reshaded against photographs, and the highlight is gone.** On "very cartoon
like", the drops were matched to pictures of the real thing
(the project's shared files, drops/references, not in the repo: oil on backlit water, projected light
shows, water drops, emulsions, foam). They agree, and they disagree with the
gate's "visible highlights": a plate lit from beneath shows transmitted light,
and not one of the backlit pictures has a white dot. What they do show is now
drawn, and `npm run droplens` measures each on a single drop over a two-colour
plate: a small drop turns the plate round it over (its near half reads 0.88 of
the way to the far side's colour, 0.06 without it); a big drop is flat on top,
so an edge under it stays on the same pixel; a thin dark line at the contact,
23 % of the plate at its darkest, under seven tenths for 12 % of the radius and
the flank inside it at full brightness (the first reshade's shadow held it to
77 %); and nothing in a drop more than 1.08 × the plate under it, where the
glint made it 2.4 ×. Whether to bring a highlight back (for the camera pass,
which looks at the plate rather than through it) is the owner's.

Then, on the owner's reading of the same photographs ("some of the bubbles
have multiple background colors in them … a great diversity of bubble
sizes"): every drop's view reaches the same stretch of plate, so a droplet
carries several colours (`npm run droplens`: a stripe three radii off is in
it, one seven radii off is not), and with drops on, a second population of
droplets rings the big drops (`npm run drops`: 61 of 170 big drops have three
or more a sixth their size touching them, against 1 of 107 for the rings;
one cluster spans 17:1). The mask for the larger crowd takes 11.7 ms in the
sandbox against 8.6, a number for the Mac's `frameMs`.

**A projector and a camera see a drop differently, and the owner chose both.**
The research (the project's shared files, drops/research/bubbles-and-drops.md,
item 1) traced what a projection lens focused on the plate sees: nothing turned
over, and a dark band wherever the drop's curve bends the light past its
aperture, from u* = X/sqrt(1 + X²), X = NA / (2 n_water (1 − n_water/n_oil)), of
the curved part out. The plate now draws that; the macro closeup keeps the
camera's inverting lens. The aperture is an effective NA of 0.25 (the bare lens's
0.08 drew a field of black doughnuts; the one measurement matched 0.30 to 0.35),
so a droplet is dark over its outer three tenths. And item 3: the gap sets the
shape, a ball until its radius is half the gap and a pool with an edge half the
gap wide past that, so a press flattens every drop and thins every edge
(`npm run droplens`: 20 checks, projected and closeup; the dark band's half
point lands within 0.011 of the radius of where the aperture puts it; bowing the
glasses to half the gap under a drop takes its dark edge from 18 to 6 pixels).
The lens changes from projector to camera over the middle fifth of the zoom's
fade, near 1.45x, because the blend between them reads a whole drop from its
centre at one point, which on the zoom's own fade sat at 1.2x.

And item 6: the wall between two pressed drops is the arc their pressures give,
radius Rs·Rb/(Rb − Rs) through the points where their circles cross, bowed into the
bigger one, so a crowd of mixed sizes reads as packed drops rather than as a Voronoi
diagram (`npm run drops`: a 3- and an 8-cell drop meet 5.5 px from the small one's
centre, the arc says 5.2, the straight wall was at 2.7). The mask takes a square root
more per wall: 15 ms for the crowd of 529 in the sandbox, against 11.
