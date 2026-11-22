# Watching in words: the vocabulary

The watch tool (`npm run watch`, `.claude/skills/watch/`) reads a film as numbers: motion,
colour, form, flow. Those numbers are right and hard to read. A person judging a light show
says "slow and heavy", "two warm colours on black", "the edges went soft". This page is the
vocabulary the tool uses to say that (PLAN 47x): the words, where each comes from, which
measure decides it, and how sure the tool can be.

Three rules hold for every word:

1. **A word carries its number.** "Sustained (motion's 90th percentile 1.3× its median)".
   A reader can always see why the tool chose the word, and disagree.
2. **A word from an unsteady measure says so.** Swells a minute, the calm share and the
   half-life of motion do not hold from one take of the same look to the next (the skill's
   film notes). A word drawn from one ends with "(may vary from take to take)". Near-black
   and hues a frame do hold, and need no hedge.
3. **A word names a source on this page.** Every term in the code's table names one of the
   sources below, so the words stay those of people who looked hard at pictures and
   movement, not ones made up for the tool.
   Each area draws on its own: motion (Time, Weight, Space, Flow, the efforts) on Laban, the
   build on Laban or Ching, colour on Itten, light on Itten, Arnheim or the wet show, form on
   the wet show or Greenberg, edges on Greenberg, composition on Arnheim, Greenberg or Ching,
   and the show's moves on the wet show. The words are the ones in bold below.

## The sources

- **Laban Movement Analysis**, the Effort factors. Rudolf Laban described how a movement
  is made, not what it is, in four factors, each between two poles: Time (sustained or
  sudden), Weight (light or strong), Space (indirect or direct) and Flow (free or bound).
  Three of them, held together, give the eight basic efforts: **float**, **glide**, **wring**,
  **press**, **flick**, **dab**, **slash**, **punch**. It was written for dancers and is used for any moving thing.
  Sources: Wikipedia, "Laban Movement Analysis"; the University of Maryland Libraries'
  Bartenieff exhibition, "Laban theory".
- **Johannes Itten**, *The Art of Color* (1961), the seven colour contrasts: contrast of
  hue, light-dark, cold-warm, complementary, simultaneous, saturation and extension
  (proportion: how much of each colour there is). Sources: Wikipedia, "Johannes Itten"; a
  summary of the seven contrasts by Online Printers.
- **Francis D. K. Ching**, *Architecture: Form, Space, and Order*, chapter 7, the ordering
  principles: axis, symmetry, hierarchy, rhythm, datum and transformation. Ching tells
  rhythm from repetition: rhythm repeats an element that changes while staying
  recognisable, repetition repeats it unchanged. Sources: the chapter as published on the
  Internet Archive; Designing Buildings, "Principles of order".
- **Clement Greenberg** and the colour-field critics: an **all-over** picture spreads its
  interest evenly to every edge with no single centre (Greenberg's "all-over" or
  "polyphonic" picture), against a **centred** one built around a figure; **flatness**; the
  colour field's broad, even areas. Sources: The Art Story, "Flatness"; the Cambridge
  University Press article on the all-over image; The New Criterion, "Notes on color field".
- **Rudolf Arnheim**, *Art and Visual Perception* (1954): **balance** (a picture's weights
  set about its centre), and **directed tension** (the pull of a shape or a line along a
  direction). Used here for where the light sits and which way it leans.
- **The wet show's own words.** The 1960s light shows were played live on overhead
  projectors in clock glasses: oil, water and dye pushed with air, gravity, heat and
  catalysts, worked by hand in layers (the Joshua Light Show at the Fillmore East; Bill
  Ham's "electric action painting" in San Francisco, a picture composed, made and shown at
  once and never stopped). Their words name what the liquid does: **cells** and **beads**
  (round drops of one liquid in another), **threads** and **marbling** (drawn-out lines),
  a **wash** (colour spreading flat), a **bloom** (a drop opening outwards), a **turned
  dish** (the whole picture rotating), a **pour**. Sources: Wikipedia, "Liquid light
  show" and "The Joshua Light Show"; Live Design, "Deja View: Joshua Light Show Is Back";
  Boing Boing's 2016 interview with Bill Ham; Art & Object, "The Kinetic Painting of Bill
  Ham"; billhamlights.com.

## The words and what decides them

The measures are the ones the tool already reads (`scripts/watch.mjs` shape(),
`scripts/watchdesign.mjs`, `scripts/watchphysics.mjs`; the skill lists each). A band below
is where a word starts; the code's table holds the exact edges, each with a comment on what
set it (a synthetic clip, a real show in `REAL_SHOWS`, a film of the app).

### Motion: Laban's Effort

| Factor | Poles | Decided by |
|---|---|---|
| Time | **sustained** to **sudden** | how the motion is spread over the samples: a picture that changes the same amount every sample is sustained; one that sits still and then jumps is sudden. The ratio of a high percentile of the per-sample motion to its median is about 1 for a steady drift and large for jumps. |
| Weight | **light** to **strong** | how much of the picture a move changes: the per-sample motion's high percentile, and the swells' peak over the median. A drift of fine detail is light; a whole frame jumping is strong. |
| Space | **indirect** to **direct** | whether the flow keeps one heading (direct: a drift, a tilt) or turns and wanders (indirect: stirring, curl). From the physics read's curl and its vertical and horizontal flow. |
| Flow | **free** to **bound** | whether the motion runs on (free) or checks and holds (bound). From the carried share and the calm share; the weakest of the four on footage, so it is said only when both agree. |

Time and Weight together name the effort where Space is clear too: sustained, light and
indirect is a **float**; sustained, light and direct a **glide**; sudden, strong and direct
a **punch**; and so on through Laban's eight. When a factor is in the middle, the effort is
not named: "sustained and light" is a true sentence, "float" would be a guess.

The build and release over a film: swells a minute and their rise and fall (a slow build and
a quick release, or the reverse), the calm share (how much of the film is near still).
Ching's **rhythm** against **repetition**: swells at an even gap whose pictures differ are
a rhythm; the same picture returning unchanged is repetition. All of these are unsteady
measures (rule 2).

### Colour: Itten's contrasts

| Contrast | Said when |
|---|---|
| **of hue** | several hues hold a share each (hues a frame three or more) |
| **complementary** | the main hues sit about opposite (hue gap near 180°) |
| **analogous** (no contrast of hue) | the main hues sit within about 45° |
| **cold-warm** | the warm share is far from a half, either way, with colour present |
| **light-dark** | a wide spread between the dark and light ends (p5 to p95, rms contrast), or much of the frame near black |
| **of saturation** | vivid areas beside greyed ones (colourfulness against the coloured share) |
| **of extension** | one colour takes most of the coloured area and another a small part |

With little colour at all the colour is **muted** or **greyed**, and no contrast is named.
Itten's simultaneous contrast (a colour seen tinged by its neighbour) is a fact of seeing,
not of the pixels, and is not said.

### Light and dark

**Dark-ground** (much of the frame near black: the wet show's look, light in a dark room),
**luminous** (bright colour over a dark ground), **washed** (bright everywhere, little
dark), **chiaroscuro** (strong light-dark contrast with large areas of both).

### Form and edges

**Hard-edged** against **soft** or **painterly** (edge width), from the colour-field and
hard-edge painters' terms. The liquid's own forms from the form reads: **cells** or
**beads** (rounded forms, low elongation), **lobes**, **threads** (long thin forms),
**marbling** (threads that keep one direction: high coherence), a **wash** (broad, even
areas with few forms). Form scale says **fine** or **broad**.

### Composition

**Centred** (Arnheim's balance about the middle; one figure on a dark ground) against
**all-over** (Greenberg: interest to every edge, no centre). **Symmetric** or
**kaleidoscopic** (Ching's symmetry: the mirror and half-turn reads), and an **axis** when
one line of symmetry or one heading of the flow lines dominates. **Off-centre** with the
way the weight leans (the centroid).

### The show's own moves

From the physics and techniques reads: a **bloom** (spreading outwards: divergence), a
**turned dish** (the whole picture rotating: curl of the whole), a **pour** (a new colour
arriving in one place), **marbling** (sheared lines), **cells** breaking or joining.

## What changed: the before/after read

Two films of the same look, before and after a change, are told apart in the same words.
A difference is named only when it is at least one **just-noticeable step**, the step sizes
`compareDesign` and `comparePhysics` already use (a colourfulness of 15, a coherence of
0.12, a ratio of 1.5 for scales, and so on), extended to the motion and shape measures. The
differences are ranked by their size in steps, said in plain sentences ("the edges went
from hard-edged to soft (edge width 0.62 to 2.67% of the width)"), and a difference in an unsteady
measure is marked as such. What held (under a step) is listed too, so "nothing else
changed" is a measured claim and not a silence.
