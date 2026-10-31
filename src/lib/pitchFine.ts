// The melody's pitch, read between the analyser's bins (PLAN 24.3-place). Moved out of
// audioFeatures.ts (PLAN 19ai, the size ratchet), which calls it once a reading.

/** Where the melody's pitch starts looking, Hz: above a kick's body, at about A2. */
export const MELODY_LOW_HZ = 110;

/*
  The melody's pitch (melodyWalk.ts), kept apart from the analyser's
  `pitch`, because the colour of the music follows that one's class (True
  Synesthesia) and would move if the note were read differently. Two
  differences, both measured by `npm run melody` on a scale of known
  notes with a kick on every beat:

  Between the bins. The `pitch` is a bin's, 43 Hz wide at 1024
  points and 44.1 kHz: two to three semitones at middle C and an octave
  across C2 to C3, so a scale read through it climbs in steps of a bin
  rather than of a note. The peak's neighbours, in the same summed
  decibels, say which side of the bin the note sits, as a parabola
  through the three (the Hann window's main lobe is a parabola near its
  top in decibels).

  Out of the kick's reach. The `pitch` product searches from 55 Hz, where
  a kick's body (45 to 120 Hz) is the loudest thing there is, and under
  a kick on each beat the median's `pitch` read the drum for half of every
  beat (28.8 where the notes were 57 to 81). The melody's search starts
  at MELODY_LOW_HZ, above the body, so the drum is not in its product
  at the fundamental; its harmonics at 2 to 4 times are, and are the
  weaker.
*/
/**
 * `hDb` is the analyser's spectrum in decibels (index = bin), `top` its last bin,
 * `maxHpsBin` the highest fundamental to try. The pitch in MIDI notes with a
 * fraction, 0 where there is no peak.
 */
export function finePitch(hDb: ArrayLike<number>, top: number, hzPerBin: number, maxHpsBin: number): number {
  const sum = (b: number) => {
    let h = hDb[b];
    if (2 * b <= top) h += hDb[2 * b];
    if (3 * b <= top) h += hDb[3 * b];
    if (4 * b <= top) h += hDb[4 * b];
    return h;
  };
  const fineLo = Math.max(2, Math.ceil(MELODY_LOW_HZ / hzPerBin));
  let fineBin = -1, fineBest = -Infinity;
  for (let b = fineLo; b <= maxHpsBin; b++) {
    const h = sum(b);
    if (h > fineBest) { fineBest = h; fineBin = b; }
  }
/*
  A peak, and only a peak. In silence, and under a kick's skirt, the
  product is flat or climbs to the search's own floor, and "the highest"
  of a flat run is its first bin: 47.8, the floor's note, read for
  silence and laid as a drop (the review of #537). A reading counts only
  where the product is strictly above both neighbours.
      */
  if (fineBin > 1 && fineBin < top && sum(fineBin - 1) < fineBest && sum(fineBin + 1) < fineBest) {
    const a = sum(fineBin - 1), c = sum(fineBin + 1);
    const den = a - 2 * fineBest + c;
    const delta = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
    return 69 + 12 * Math.log2(((fineBin + delta) * hzPerBin) / 440);
  }
  return 0;
}
