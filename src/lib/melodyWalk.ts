/**
 * The melody walks across the plate (PLAN 24.3-place, direction B of the
 * owner's 2026-10-24 exploration of presets that listen).
 *
 * What was asked. The owner, 2026-10-24: the presets are not complex enough,
 * and parts of the canvas should answer the music, not only the whole of it.
 * Areas (PLAN 25h) gave the bands each a pool of their own; a melody is
 * neither a band nor a place, it is a line that goes up and down, and the one
 * thing a plate has that a line can go along is its width. So a played line is
 * drawn across the plate: each note lets go of one drop, low notes on one side
 * and high notes on the other, how hard it was struck setting how big the drop
 * is. Played up a scale the drops step across the dish; a tune that goes up
 * and comes back draws there and back, and a note it returns to is a place it
 * returns to, where the drop meets the one laid there before.
 *
 * ## What is heard, and why a drop waits
 *
 * Fast readings only (the owner's standing rule for presets, PLAN 28f): the
 * `note` source's onsets (55 to 1000 Hz, a new arrival of energy there) say
 * *when* a note began, and the analyser's pitch (`AudioReading.pitchFine`, in
 * MIDI notes, read between the bins and from A2 up so a kick is out of it)
 * says *which*. The two do not arrive together. The pitch is read from a
 * median of the last fifteen spectra (audioFeatures.ts: it is the median that
 * keeps a drum's smear out of the harmony), so a new note takes the median only
 * on the eighth reading after it starts, about 130 ms at the ear's sixty a
 * second; a drop placed on the onset's own reading was placed by the note
 * before. Measured by `npm run melody` on a scale played note by note: placed
 * on the onset, 6 of 7 drops sat on the wrong note; after the settle, 10 of 10
 * within a semitone and a half. So an onset arms a drop, and the drop lets go
 * when the pitch has had the time the reading says it needs
 * (`AudioReading.pitchSettleS`, which follows the ear's actual rate, so a slow
 * Mac is not placed by a note it has already left). That is a tenth of a
 * second behind the note, which a liquid takes for the time a drop takes to
 * fall.
 *
 * A drum is not a note. The note band overlaps the kick's body, so a kick calls
 * a note onset of its own, and the snare source fired at full strength on 8
 * of 15 notes of the test scale (a lead's third and fourth partners are in its
 * 1 to 5 kHz). An onset within `DRUM_WINDOW_S` of either drum's may be the
 * drum's, and lays a drop only if it moved the pitch (`CHANGE_SEMITONES`): a
 * drum leaves the median where it was, a note does not. A kick cannot simply
 * veto: a kick with the bass or the lead on the downbeat is the commonest
 * thing in the music (a veto laid none of the scale's 15 notes with the kick
 * on each note). The cost is a note repeated on the same pitch under a drum,
 * which is lost.
 *
 * ## Where, along the line
 *
 * A look gives the melody a line across its plate (`MELODY_LINES`): where the
 * lowest note lands and where the highest, and how far a note may sit off the
 * line by its place in the key. The line is the look's: Aurora Borealis's runs
 * along the top of its curtains, where the current draws each run into a
 * ribbon, and Oil and Water's across the middle, where each note is a bead of
 * oil that rounds into a body or merges with its neighbour by the liquids' own
 * immiscibility.
 *
 * Along the line the pitch is placed on a fixed scale, `SCALE_LOW` to
 * `SCALE_HIGH` (C3 to C6, the compass of the ear's pitch), a semitone being
 * the same distance everywhere on it. So a note is always in the same place,
 * in any song, and a scale played up is evenly spaced across the plate. It
 * was first placed against the range the tune had used lately, so that a
 * melody of an octave and a half would use all the width; a rising scale
 * (`npm run melody`) made every new note a new top of that range and stacked
 * the scale up at the line's far end, five of nine drops on one spot. A tune
 * in one octave uses a third of the line, which is what an octave is.
 *
 * The distance off the line is the note's place in the circle of fifths (C, G,
 * D ... one step each), not its height: notes a fifth apart sound near each
 * other, and sit near each other, so a melody that stays in a key stays in a
 * band of the plate and one that leaves the key leaves it. Two notes of the
 * same name, an octave apart, are the same distance off the line and differ
 * only along it.
 *
 * Arithmetic only, no DOM or GPU, so `npm run melody` drives it with the
 * readings of a made-up tune and the visualizer lays what it returns.
 */
import type { AudioReading } from './audioFeatures.ts';

/** Where a look's melody is drawn, in the plate's own 0..1. */
export interface MelodyLine {
  /** The lowest note's end of the line. */
  x0: number; y0: number;
  /** The highest note's end of the line. */
  x1: number; y1: number;
  /** How far a note may sit off the line by its place in the circle of fifths, as a share of the plate (the farthest is half of it each way). */
  spread: number;
  /** The one liquid every note of this look is (a bottle id, lib/presetPlate.ts); else the look's own draw, as its music pours. */
  liquid?: string;
  /** The dyes (palette indices) the line walks through, low to high; else the look's working harmony. */
  dyes?: number[];
}

/** What one note lays: where, how big, and the note it was. */
export interface MelodyDrop {
  /** On the plate, 0..1. */
  x: number;
  y: number;
  /** 0..1 along the line, low to high. */
  along: number;
  /** MIDI note number, as the analyser reads it. */
  pitch: number;
  /**
   * How hard the note was struck, 0..1: the note band's level (against its own
   * recent range) at its highest between the onset and the settle. Not the
   * onset's own strength, which is a rise in decibels against the hardest rise
   * lately and is nearly the same for a soft note out of silence as for a hard
   * one (0.79 for a note 12 dB down, 1.00 for the loud one, and 0.55 for a
   * loud one after another).
   */
  strength: number;
  /** The reading's clock when the note began. */
  at: number;
}

/** Every look without a line of its own: straight across the middle. */
export const DEFAULT_MELODY_LINE: MelodyLine = { x0: 0.12, y0: 0.5, x1: 0.88, y1: 0.5, spread: 0.2 };

/**
 * The looks that have a line of their own. Only the two the exploration named
 * so far; every other look takes the default if its owner turns Melody Walk up.
 */
export const MELODY_LINES: Readonly<Record<string, MelodyLine>> = {
  // Along the top of the curtains, rising a little to the right as the curtain's fold does.
  'aurora-borealis': { x0: 0.1, y0: 0.3, x1: 0.9, y1: 0.18, spread: 0.12 },
  // Across the dish's middle, where the oil's pools lie, wide enough to reach the water between them.
  // Every note a bead of the amber oil (the look draws water too, at random, and water on water is no bead).
  'oil-and-water': { x0: 0.12, y0: 0.5, x1: 0.88, y1: 0.5, spread: 0.34, liquid: 'oil', dyes: [17] },
};

export const melodyLine = (presetId: string | null | undefined): MelodyLine =>
  (presetId && MELODY_LINES[presetId]) || DEFAULT_MELODY_LINE;

/** How long after the onset the pitch is read if the reading does not say: 8 of the ear's 15 readings at 60 a second. */
export const SETTLE_DEFAULT_S = 0.15;
/** The longest a drop waits for its pitch, however slowly the ear reads. */
export const SETTLE_MAX_S = 0.45;
/**
 * The lowest note laid: A2 and the first bin above the melody's search floor
 * (`MELODY_LOW_HZ`, 110 Hz, MIDI 45; audioFeatures.ts says why it starts
 * there). It is a second line behind the ear's own peak test, which already
 * reads 0 where there is no peak (silence, a kick's skirt): the bin at the
 * floor reads 47.8, so this is a guard on a note the ear did read, not the
 * thing keeping the floor out. A bass line below A2 draws nothing; it has its
 * hands.
 */
export const MELODY_LOW = 46;
/** An onset this close to a kick's or a snare's is, or may be, the drum's. */
export const DRUM_WINDOW_S = 0.06;
/** Two drops never closer than this: a trill is a trill, not a flood (sixteenths at 140 are 107 ms). */
export const MIN_GAP_S = 0.09;
/** The scale along the line: C3 to C6 in MIDI notes. */
export const SCALE_LOW = 48;
export const SCALE_HIGH = 84;
/**
 * A note onset beside a kick's or a snare's must be a note that changed the
 * pitch by this many semitones, or it is the drum's. It was 0.8, and a
 * semitone step lost: the pitch glides through the settle (the median turns
 * over a few readings) and the fine pitch's own error is a third of a
 * semitone, so a real step reads 0.6 to 1 (72 and 77 of the scale were lost
 * on a drum-free run). The snare's onset fires on a lead's own attack (its harmonics from a third or fourth partner up are in the
 * snare's 1 to 5 kHz: 8 of 15 notes of a scale played above A3 called a
 * snare of full strength), so a snare cannot veto a note outright; but a real
 * snare's crack under a held note is dropped by the pitch's median and leaves
 * the pitch where it was, so a note that did not move it is not a new note.
 */
export const CHANGE_SEMITONES = 0.5;
/** A clock that jumps by more than this, backward or forward, is another stream. */
const JUMP_S = 5;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0);

/** Place in the circle of fifths, 0..11 (C = 0, G = 1, D = 2 ...): a fifth is 7 semitones, and 7 times 7 is 1 mod 12. */
export const fifthsPlace = (pitchClass: number): number => (((Math.round(pitchClass) * 7) % 12) + 12) % 12;

export class MelodyWalk {
  /** The note armed by its onset, waiting for its pitch to settle. */
  private armed: { at: number; peak: number; settle: number; before: number; needsChange: boolean } | null = null;
  private noteAt: number | null = null;
  private lastDropAt = -Infinity;
  /** The pitch of the last reading, to see a note change it. */
  private last: number | null = null;
  /** Drops let go since the page loaded, for a check. */
  count = 0;
  /** Note onsets the drums took, for a check. */
  drummed = 0;
  /** Note onsets with no pitch under them, for a check. */
  unpitched = 0;

  /** Forget: a stop, a render starting, a new stream. */
  reset(): void {
    this.armed = null;
    this.noteAt = null;
    this.lastDropAt = -Infinity;
    this.last = null;
  }

  /**
   * One reading (or null: nothing to hear), `line` being where the look draws.
   * Returns the drops this reading lets go of, normally none and sometimes one.
   */
  update(reading: AudioReading | null, line: MelodyLine = DEFAULT_MELODY_LINE): MelodyDrop[] {
    if (!reading) { this.armed = null; return []; }
    const time = reading.time;
    // A clock that jumped is a new stream: a note armed on the old one is not a note on this one.
    if (this.last !== null && (time < this.last - 0.5 || time > this.last + JUMP_S)) this.reset();
    this.last = time;

    const fine = reading.pitchFine && reading.pitchFine > 0 ? reading.pitchFine : reading.pitch;
    const note = reading.onsets?.note;
    if (note && note.at !== null && note.at !== this.noteAt) {
      const first = this.noteAt === null;
      this.noteAt = note.at;
      // An onset from before this began listening is history, not a note.
      const stale = first && note.at < time - SETTLE_MAX_S;
      if (!stale) {
        const kick = reading.onsets.kick?.at, snare = reading.onsets.snare?.at;
        /*
          A kick's body is in the note's band, so its onset calls a note
          onset of its own; a snare's crack is in the lead's partners. Either
          beside an onset makes it one that may be the drum's, and then it
          counts only if the pitch moved. A kick could not simply veto: a
          kick on the downbeat with the bass or the lead is the commonest
          thing in the music, and a veto laid 0 of 15 notes with the kick on
          the note and 7 of 15 (2 on the wrong note) 30 ms off it (the review
          of #537).
        */
        const beside = (d: number | null | undefined) => d != null && Math.abs(d - note.at!) <= DRUM_WINDOW_S;
        this.armed = {
          at: note.at,
          peak: clamp01(reading.note),
          settle: Math.min(SETTLE_MAX_S, Math.max(0.03, reading.pitchSettleS ?? SETTLE_DEFAULT_S)),
          // The pitch the onset's own reading still holds: the note before.
          before: fine,
          needsChange: beside(kick) || beside(snare),
        };
      }
    }

    const a = this.armed;
    if (a) a.peak = Math.max(a.peak, clamp01(reading.note));
    if (!a || time < a.at + a.settle) return [];
    this.armed = null;
    // Nothing pitched under the onset (a noise burst in the band): no note to place.
    if (!(fine >= MELODY_LOW)) { this.unpitched++; return []; }
    if (a.needsChange && Math.abs(fine - a.before) < CHANGE_SEMITONES) { this.drummed++; return []; }
    if (a.at - this.lastDropAt < MIN_GAP_S) return [];
    this.lastDropAt = a.at;

    const along = clamp01((fine - SCALE_LOW) / (SCALE_HIGH - SCALE_LOW));
    const cls = ((Math.round(fine) % 12) + 12) % 12;
    const off = (fifthsPlace(cls) / 11 - 0.5) * line.spread;
    // The line's own normal, so a line that climbs is offset square to its run.
    const dx = line.x1 - line.x0, dy = line.y1 - line.y0, len = Math.hypot(dx, dy) || 1;
    const x = clamp01(line.x0 + dx * along - (dy / len) * off);
    const y = clamp01(line.y0 + dy * along + (dx / len) * off);
    this.count++;
    return [{ x, y, along, pitch: fine, strength: a.peak, at: a.at }];
  }
}
