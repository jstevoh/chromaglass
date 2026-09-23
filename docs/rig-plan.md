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
