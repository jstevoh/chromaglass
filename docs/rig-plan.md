# Plan: the rig — many projectors on one screen

The app has one plate and one output. A sixties light show had neither.

## What the rigs actually were

Worth stating with numbers, because the numbers decide the architecture.

The **Joshua Light Show** at the Fillmore East ran *three overhead projectors,
three film projectors, two banks of four-carousel slide projectors*, hundreds of
colour wheels, motorised reflectors, two hair dryers, and dozens of clock
crystals — on two elevated platforms about twenty feet behind the stage, rear
projecting onto the screen. Shows in general ran from **a single operator with
two or three projectors up to ten operators and seventy-plus**.

Three things follow, and each is an architectural decision rather than a
feature:

- **Each projector is its own source.** An overhead with a dish of oil, a
  carousel of slides and a film loop are not crops of one picture. The app's
  surfaces are all windows onto the same plate, which is the one thing a rig
  is not.
- **Beams add.** Overlapping projections are additive light. Two beams crossing
  make a brighter, differently-coloured region, and that region is the point —
  it is where the composition happens.
- **The masks were soft on purpose.** Operators taped the projector stage down
  to an opening of about four and a half inches so their hands stayed out of
  the picture, and the edge masks in use had **blurred transition zones that
  overlap on the screen to equalise the illumination**. That is soft-edge
  blending, invented on the job. A hard-edged mask is the wrong default.

## What the app already has

More than it looks. `lib/outputConfig.ts` carries a `Surface` list, up to
**sixteen**, and each one already has:

- a **shape** — `rect`, `ellipse`, `triangle`, `diamond`;
- **four corners** on the wall, so it is a full corner-pin quad rather than a
  rectangle, with keystone for free;
- a **source rect**, which piece of the plate it shows — this is exactly the
  taped aperture, and it is already there;
- **enabled**, **opacity**, **feather**.

And the output as a whole has flipX (rear projection, which is how these were
rigged), flipY, corner pin, edge masks, feather, gain and gamma.

So the geometry is built. What is missing is that **every surface shows the
same plate**, and that the optics are the output's rather than each
projector's.

## The work

### R1 · A surface becomes a projector: its own source

The single change everything else needs. A projector gains a `source`, and a
source is one of:

- a **plate** — one of the app's liquid layers, with its own look and its own
  settings, which is the overhead with a dish on it;
- a **film** — the existing film/video path, which is the film projector;
- a **slide** — a still, which with the European school's plan
  ([`slide-plan.md`](slide-plan.md)) becomes a cooking 2-inch slide;
- a **lumia** — the existing Wilfred mode.

*This is the expensive one*, because more than one live plate means more than
one solver. The app already runs two layers; a rig wants perhaps four. The
quality ladder has to know, and the honest answer is that a rig preset runs at
a coarser grid per plate than a single-plate look does.

### R2 · Optics, per projector

Each of these is what the hardware actually had, and each is a control:

- **Focus.** A blur. On a real rig, focus is a per-projector knob and a soft
  projector behind a sharp one is the oldest depth trick there is. The post
  chain can already blur ([`filters-plan.md`](filters-plan.md) F0).
- **Brightness and contrast.** Per projector, not per output — a dim wash under
  a hard-edged shape is a composition. The output's `gain` and `gamma` are the
  right controls at the wrong scope.
- **Colour.** A gel, and a **colour wheel** — the rigs had hundreds. A slow
  rotation through a palette, per projector, is most of the movement in the
  archive footage.
- **The aperture**, which is the source rect that already exists, given a shape
  and a soft edge of its own so the operator's hands are masked the way tape
  masked them.

### R3 · Beams add, and the seam disappears

The default combination is **additive**, because that is what light does. Two
overlapping beams brighten, and the overlap is the instrument.

Then the thing the operators worked out: a soft edge on each projector so the
overlap region does not read as a bright seam. Feather exists per surface; what
is missing is that feather should fall off so that **two overlapping feathered
edges sum to one**, which is a specific curve and not a linear ramp.

### R4 · Placing a projector by hand

The corner quad is the right representation and the wrong control. A person
aiming a projector thinks in **where it points**, **how big it is**, and
**how it is turned** — so centre, zoom and rotation become the controls, and
they *derive* the quad. The quad stays underneath for keystone, which is a
separate act done once at load-in.

### R5 · The rig is a document

A rig is a configuration of several projectors, and it is the thing a show is
built on. It saves, recalls and cues: "all four up", "kill two and three",
"cross-fade one into four". The cue list and sequencer already exist and point
at looks; they want to point at rigs.

## Order, and why

R1 first, because every other item is meaningless while all the projectors show
the same picture. R3 next, because additive combination is what makes two
projectors better than one and it is nearly free. R2 then — it is a pile of
independent controls, each small. R4 is ergonomics and can come any time after
R1. R5 is authoring and comes last.

## What this costs

Honestly: several live plates is the whole cost, and it is real. Everything
else here is a uniform and a slider. The decision to take is how many plates a
rig may have — four at a coarser grid is a different machine from two at a fine
one, and the quality ladder currently assumes the latter.

## Sources

- [The Joshua Light Show — Handmade Cinema](https://handmadecinema.com/filmmaker/the-joshua-light-show/)
- [The Joshua Light Show at the Fillmore East — University of Iowa](https://dsps.lib.uiowa.edu/downtownpopunderground/story/the-joshua-light-show-at-the-fillmore-east/)
- [Liquid light show — Wikipedia](https://en.wikipedia.org/wiki/Liquid_light_show)
- [An audiovisual experience: the 1960s — HeavyM](https://www.heavym.net/did-you-know-4-the-1960s/)
- [Soft edge mask (patent US5077154)](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5077154)

---

# R6 · ChromaGlass watching a real rig

The idea: point the camera at a screen an analogue light show is being projected
onto, and let the app respond to the *picture* as well as the music. A rig is
many projectors on one screen; this makes one of them a real one, from 1967, and
the app the newest operator on the bank.

The camera pipeline already exists and is aimed at the wrong thing. Room sensing
looks for **disturbance** — somebody moved, the energy went up. A projected
liquid light show is not disturbance; it is a structured image of the same
physical process this app simulates. The camera stops being a motion sensor and
becomes a second plate to read.

## What the sensor actually gives, today

Checked rather than assumed, because the whole plan turns on it.
`lib/sceneSense.ts` has no DOM in it and is driven in Node by `npm run scene`,
so it is the cheapest thing here to extend and to test.

**Per cell, on a 24×24 lattice (576 vectors):**

- `flowX` / `flowY` — Lucas–Kanade optical flow, deadzoned and smoothed in time.
  **This is the surprise: the hardest-sounding piece is already built.** It is a
  velocity field, which is what a solver eats.
  *With a caveat its own comment states:* Lucas–Kanade linearises, so past about
  a pixel of displacement a frame it under-reads — `scripts/scene.mjs` measures
  a bar crossing at 0.6 frame widths a second as about **0.1**. Read it as a
  direction with comparable magnitudes, never as a calibrated speed.
- `motion` — how much changed in each cell, 0..1.

**For the frame as a whole:** `energy` (normalised against the room's own recent
range), `raw`, `centroidX/Y`, `dirX/dirY`, `spread`, `brightness`, `hue`,
`chroma`, `people[]`, `crowd`.

## And what it does not give

Every one of these is the plate's vocabulary rather than a room's, and none of
them exists:

- **Coverage.** There is `motion`, which is what *changed*, and `brightness`,
  which is one number for the frame. Nothing says where the dye is. This is the
  single most important missing feature, because it is the analogue of `dye.a`.
- **Palette.** `hue` and `chroma` are the frame's colour *centroid* — one hue and
  one saturation. **A magenta-and-cyan plate averages to grey.** Anything that
  wants to wear a rig's palette needs a histogram or a few dominant colours, not
  a mean, and a plan that says "read the palette" without this is wrong.
- **Scale and structure.** No edge density, no characteristic blob size. Big slow
  cells and fine fast stipple are indistinguishable to the sensor as it stands,
  and telling those apart is most of what "the rig's character" means.
- **Rings and holes.** The bright-rimmed dark disc that H6 spent a week getting
  right is exactly what a bubble looks like to a camera, and nothing looks for
  one.

**So the prototype worth building first is none of the four modes below.** It is
the feature extractor, run against footage of a real show, answering one
question: can it reliably tell *big slow magenta blobs, settling* from *small
fast cyan cells, agitating*, under projection-screen conditions? If it cannot,
nothing downstream has anything to run on.

## Four modes, and they are different instruments

### 1 · Mirror — it learns the rig's look

Colour, scale, edge sharpness and speed drive the *look settings* — palette,
`blobSurfaceTension`, `viscosity`, `globalSpeed`, `dyeBudget`. The app runs its
own physics wearing the rig's character, and drifts as the operator works the
dish. Two plates that look like siblings rather than a copy.

Nearly free once the features exist: it is `sceneMappings` pointed at look
settings instead of at stirring, through the patch bay that already routes
features per layer.

### 2 · Couple — the rig's currents stir the liquid

The flow lattice becomes a velocity field in the solver. Physically the most
interesting, and it walks straight into the trap this codebase has paid for
**five** times now — the bubbles, the blow, the magnet, the press, and the
squeeze film — **a field added to the velocity loses its curl-free part to the
next projection.**

There is a reason to think this one survives better: optical flow off a real
liquid is largely divergence-free already, because liquid conserves area. But
that is a hypothesis, and the rule stands — measure it, and if it is eaten,
enter through the divergence, the dye's own transport, or a multiply.

Two practical notes: the lattice is 24² against a solver at 192² or 384², so it
wants upsampling; and the flow under-reads at speed, so it must be treated as a
direction with a gain, not a measurement.

### 3 · Answer — it plays against the rig

The rig goes dark upper-left, the app blooms there. The rig leans magenta, the
app leans cyan. The rig settles, the app agitates.

This is the only mode that sounds like two operators listening to each other
rather than one following the other, and it is the argument for doing any of
this. Without it you have built an expensive mirror. It needs the palette work
above, because "lean the other way" is meaningless against a colour centroid.

### 4 · Register — the two images share a frame

Find the rig's projected quad in the camera's view, and the app knows where the
rig's image sits in its own output space. It can then place itself deliberately:
beside it, inside its dark regions, keyed through its holes, masked to its
complement.

The `Surface` system is exactly this machinery — sixteen surfaces, shapes,
corner-pin quads, source rects — and this plan already treats overlapping beams
as additive, which is what the screen does anyway. Registration also solves a
problem the other modes have: cropping to the quad is how you stop measuring the
audience, the operator's silhouette and the room.

## The hard parts, stated plainly

**The feedback loop.** If the app is projected onto the screen it is watching, it
sees itself: a closed loop with gain, which either dies or runs away. The
failure mode is already known here — `scripts/scene.mjs` runs *a camera on
itself* for forty seconds precisely to see whether it finds a ceiling or keeps
climbing. Mitigations: watch only the rig's half of the screen; subtract your own
last frame, which you know exactly because you sent it; or run at low gain
behind a hard ceiling.

**Photometry.** A camera pointed at a projection screen fights exposure, white
balance, moiré, keystone, the room's light and the projector's gamma.
Auto-exposure alone will chase the show and make brightness meaningless. Same
class of problem as the flash guard, and it wants the same answer: a known
reference in frame, or auto-exposure locked off.

**Latency.** Capture plus analysis is a few frames. Irrelevant for Mirror and
Answer. For Couple it means being stirred by currents that have already moved —
a real artefact at speed and invisible at the pace a liquid show actually runs.

**Consent.** This is still a camera in a room. It only opens on an explicit
click now, and a remembered switch is an offer rather than an instruction; that
holds here and is not to be loosened because the camera is pointed at a screen
rather than at people.

## Order

The extractor first, and alone, judged against real footage. Then Mirror,
because it needs nothing else. Then Register, which makes the other two honest
by cropping away the room. Then Answer, which is the point. Couple last, because
it is the one that has to fight the projection and the one that can be cut
without losing the idea.
