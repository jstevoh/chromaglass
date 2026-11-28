import type { Preset } from './presets';
import type { VisualizerSettings } from './types';

/*
  The built-in looks that the real dye mixing left looking wrong, re-tuned
  with their own dials (PLAN 28i-8).

  What was reported (2026-11-27): once the real dye mixing landed, the owner
  asked for the looks to be re-tuned, but only the ones that look bad. The
  stills of PR #1020 named six suspects; this file holds the four built-in
  ones (Classical Vibe and Mushy Mushy are the owner's own, edited in place
  in presetsOwner.ts).

  How each was judged: every look rendered in the lab (scripts/lookstills-
  entry.ts `renderLook`, the real solver and plate shader on this Mac's GPU,
  the synth band at a sixtieth of a second a step) at 10, 30 and 60 s,
  measuring the picture's mean luminance (Y), the share of the frame
  clipped to white, the share near black, and colourfulness (Hasler and
  Süsstrunk), and then looked at by eye. All four were as bad as their stills.

  What this file may touch: a look's light, exposure, lamp, dye budget and
  the liquid's own dials. No shader is changed and no look is given a stir,
  a pour or a liquid it did not have; the physics is what it was. Kept out
  of presets.ts, which sits at its size ceiling (`npm run sizes`).

  Where it runs (presetsLay.ts): after layPaceLooks and before
  layStirCords, so the music's stir cord is sized from the Turbulence set
  here, and after layMoireLooks, whose moiré copies of Poster and Lava Lamp
  keep the settings they were made from.
*/
const RETUNES: Record<string, Partial<VisualizerSettings>> = {
  /*
    Poster, 1969: 47% of the frame clipped to white at 10 s and 37% at 60 s.
    It is drawn on the lamp (Lamp Ground 1: the light comes through the
    plate from a lamp behind it), and with the full lamp every gap between
    the two opaque dyes was blown-out white, the orange and ultramarine
    lost at their edges where they thin. Half the lamp keeps the poster's
    paper ground (0 put the dyes on black, 30–44% of the frame dark, which
    is not a screen print) and the exposure, which sets where dye thin
    enough reads as bare glass, at 0.55 keeps the hard edges. After: no
    clipping at 30 or 60 s, the two dyes flat and vibrating against a pale
    ground. Exposure 0.4 on the full lamp still clipped 21%: the lamp, not
    the film, was the cause.
  */
  'poster-1969': { lampGround: 0.5, exposure: 0.55 },
  /*
    Turing Print: dark. Y 0.05 with 64% of the frame near black at 30 and 60
    s. A CIMA print in starch is blue-black stripes on a clear gel under a
    white lamp, and the stripes are where the dye is; at Dye Budget 0.85
    the regulator held so much dye on the plate that the stripes merged into
    one blue-black field, and the clear gel the labyrinth needs between them
    was gone. Half the dye (0.5) leaves the gel between the stripes, and the
    exposure up to 0.9 lets the thinnest dye read as clear rather than grey.
    After at 30 s: Y 0.22, 46% dark (the stripes themselves), 3% clipped.
    Lower dye (0.4, exposure 1) clipped 16%; the lamp showed through bare.
  */
  'turing-print': { dyeBudget: 0.5, exposure: 0.9 },
  /*
    Lava Lamp: 64% of the frame clipped to white at 10 s, 26% at 60 s. The
    plate stands over a warm lamp, and the bulb (#ffc457) was bright enough
    that the clear liquid round the wax, which is most of the frame, burnt
    out. A dimmer, deeper amber bulb (#e3a347) is the same lamp turned
    down: after, no clipping at 30 s and Y 0.32, the wax blobs coloured
    against an amber glow. Oil Weight stays at 0.5, so the wax still pools,
    rises warm and sinks cool (`npm run lavacycle`, `lavaround`, `lavawax`,
    `sealed`). Exposure 0 (dimming the film, not the bulb) still clipped 37%.
  */
  'lava-lamp': { ledColor: '#e3a347' },
  /*
    Lacing Run: dimmer. Y 0.17 at 10 s, 0.09 at 30 s and 60 s, and by 30 s
    the amber tongue the description promises was one soft blurred blob on
    the dark red ground. Its Turbulence (0.7) is a curl noise whose lowest
    octave is the size of the dish and is not held closed at the open rim,
    so on the thin gap it smears the tongue into a blob and carries dye out
    over the rim (PLAN 18a-25). At 0 the tongue keeps its edges and drags
    its lacing again: at 30 s and 60 s a defined amber and yellow tongue,
    Y 0.13 and 0.09, colourfulness 97 and 81 against 82 and 74. It is only
    partly mended: the room still stirs it (the music's stir cord on
    Turbulence is re-sized for 0 by layStirCords, which runs after this, and
    Air 0.2 is untouched), and that stir still carries dye out, so the dish
    is about as dim as it was (a mean of 0.06 at 60 s). Turbulence 0.1–0.4
    left less (0.02–0.08); a lower Sound Drive left less again, and the
    surfactant, fingering and lacing cords made no difference, so none of
    those changed. The rest is 18a-25's fix to the stir itself.
  */
  'lace-run': { turbulenceScale: 0 },
};

/** Lay the re-tunes over the looks they name (PLAN 28i-8). */
export function layRetuneLooks(looks: Preset[]): void {
  for (const look of looks) {
    const p = RETUNES[look.id];
    if (p) look.settings = { ...look.settings, ...p };
  }
}
