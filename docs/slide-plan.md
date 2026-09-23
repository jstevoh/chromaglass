# Plan: the European school — slides, heat, and the photoscope

The plate this app models is the **American** overhead-projector tradition: a
clock-glass dish on a horizontal stage, worked by hand from above, wet and
continuous, with the projectionist's hands in the picture. Joshua Light Show,
Brotherhood of Light, the Fillmore.

There is another school and this app cannot do any of it. In Britain and
Europe the instrument was a **slide projector**, and everything follows from
that one difference.

> **A note on the names.** The London work usually credited here is **Mark
> Boyle and Joan Hills** — the Boyle Family — who ran the liquid projections at
> the UFO Club for Pink Floyd and Soft Machine from 1966, and later toured with
> the Sensual Laboratory. (Joan Hills, not "Jonah Hill" — worth getting right in
> a document that will be cited, since she is half the practice and is
> routinely left out of the credit.)

## Why a slide projector changes everything

An overhead projector has a large horizontal stage, a cool lamp a long way
below, and a dish you can put your hands into. A slide projector has none of
those. It has a **2-inch aperture**, held **vertically**, with a fierce lamp
inches away behind it.

That gives four differences, and each is a feature rather than a limitation:

- **The stage is 2 inches across, not a foot.** Everything is magnified far
  harder, so the picture is made of structures a few millimetres wide. This is
  *the macro end of the plate*, permanently — closer to the ferrofluid
  reference in [`bubbles-plan.md`](bubbles-plan.md) than to a Fillmore wash.
- **It is vertical.** Liquid runs *down*. The whole gravity story changes: a
  drip is a real drip, heavier liquid sinks visibly, and the slow slump of a
  thick medium down the glass is one of the school's signatures. The plate
  currently has no preferred direction at all beyond a gentle tilt.
- **The heat filter comes out.** This is the deliberate act that defines the
  school. A projector has a dichroic filter to keep the lamp's infrared off the
  slide; **taking it out lets the lamp cook the liquid**. What was a cool dish
  becomes a hotplate an inch from a 300-watt bulb, and the liquid boils, bubbles
  and burns away *while it is on the screen*. The show has an arrow of time: a
  slide is born, blooms and dies, and you change it.
- **A slide is a discrete object.** There are many, they are prepared in
  advance, and the performance is partly *which slide, when*. That is a cue
  list, which this app already has, pointed at something new.

## What the app would need

Ordered by what each unlocks, and cross-referenced where the machinery already
half exists.

### S1 · The slide: a vertical, 2-inch stage

A render mode rather than a new solver. The plate becomes a tall, narrow
aperture; gravity acquires a direction and a magnitude that means something;
the frame is the slide's edge, with the characteristic **soft round-cornered
gate** of a projector — which F1's film stock already draws
([`filters-plan.md`](filters-plan.md)).

*Needs:* a real gravity vector in the solver. Today `centerGravity` pulls
toward the middle and the tilt is small; neither is "down".

### S2 · Heat, and boiling the liquid away

The one that makes it the European school rather than a narrow American one.

**The plate already has most of this and none of it is joined up.** There is a
temperature field (`vel.z`), heat goes into it from about twenty places,
`heatDecay` cools it and buoyancy lifts what is warm. What is missing is
written up in [`bubbles-plan.md`](bubbles-plan.md) §"Nucleation": every heat
source is *maximally* buoyant regardless of how much heat it got, because the
seeds saturate the buoyancy `tanh`, so a plume has a position and no strength.
Fixing that is the prerequisite here.

Then:
- **The lamp is the heat source**, not a tool. Heat arrives through the gate,
  hottest at the centre, all the time, and the look's control is how much
  filter is left in.
- **Boiling**, which needs the air field from H6 — bubbles nucleating where the
  liquid is hottest rather than where a hand put them. The air field exists and
  works; what it lacks is a reason for a bubble to appear on its own.
- **Burning away.** Evaporation that is *local and thermal* rather than a flat
  plate-wide decay, so the slide develops a dry, blistered hole in the middle
  and the colour retreats to the rim. This is the arrow of time, and it is the
  thing no overhead-projector look can do.

*Depends on:* the buoyancy saturation fix, and H6's air field (done).

### S3 · The bubbler

Air pumped *into* the liquid from below, continuously, rather than bubbles
appearing where they are told. On a vertical slide the bubbles rise, which
gives the constant upward travel the UFO Club footage is full of.

*Needs:* H6's air field (done), a source rather than a list, and S1's gravity
so they know which way is up. This is nearly free once S1 and S2 land.

### S4 · The photoscope

Mark Boyle's own instrument, and the most distinctive thing here. Two glass
slides with liquid between them, **squeezed and twisted by hand** — the film
between them stretching, thinning and breaking into the cell structures that
are the school's visual signature.

**This is the squeeze film the solver already models**, worked properly: the
gap between two glasses, pressed and sheared. What it needs is the press to
actually do something, which is its own open item — and a *shear* as well as a
press, because twisting one slide against the other is what tears the film into
cells.

*Depends on:* the press working. See the note below.

### S5 · The slide as a cue

Slides are discrete and prepared. The sequencer and cue list already exist, so
this is mostly authoring: a slide has a liquid recipe, a heat level and a
lifetime, and the show is a run of them. It gives the app its first real notion
of a piece with a *beginning and an end* rather than an endless wash.

## Why this order

S1 is the floor: without a direction for "down", none of the rest reads. S2 is
the identity of the school and it is mostly wiring things that already exist.
S3 falls out. S4 is the deepest and waits on the press. S5 is authoring and can
happen any time after S2.

## What it shares with what is already planned

- **Macro scale** — the same argument as the ferrofluid's macro end
  ([`bubbles-plan.md`](bubbles-plan.md) B): domains a few cells wide, thin rims,
  shallow depth of field.
- **The air field** (H6, done) is what bubbles and boiling are made of.
- **Heat** is the unbuilt half of that plan's §"Nucleation", and this is the
  look that most wants it.
- **Depth and a wet carrier** ([`bubbles-plan.md`](bubbles-plan.md) F) matter
  more here than anywhere: a slide is a genuinely thin film, and burning a hole
  in it is a statement about depth.
- **The gate** is F1's, already drawn.

## Two honest warnings

**The press does not work yet.** S4 is the heart of this school and it rests on
a squeeze film whose whole contribution was, until recently, a pressure
gradient added to the velocity — which the pressure projection then removed.
That is being fixed; until it is, S4 is not buildable and should not be
scheduled.

**Heat is not wired.** Every claim in S2 depends on a temperature field that
exists, is fed, and is *not* saturated at every source. That fix is a
prerequisite and it is small; it just has not been done.
