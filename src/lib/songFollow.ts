/**
 * Where are we in a song the show already knows, when it is played live:
 * slower or faster than the recording, on other instruments, with a chorus
 * played twice, a verse left out, a solo that runs as long as it runs, or a
 * jam the recording never had?
 *
 * PLAN.md 28g. The owner, 2026-10-11: "if we pre record the shape of the
 * song, how can we map that to a different sounding and sometimes
 * improvisational version of the same song?" A song map (`songMap.ts`) is
 * read by playback position, so it fits only the recording it was made from.
 * This reads it by what is heard instead.
 *
 * What it matches. The map carries the harmony of the recording, a twelve-
 * note profile four times a second (`chroma.ts`), and the room's is heard the
 * same way. Harmony is what a different band, a different mix and different
 * instruments keep: the verse's chords are the verse's chords. Loudness and
 * brightness are not used at all, because they are exactly what a live take
 * changes.
 *
 * How it follows. Every place in the map (a quarter second each) at every
 * tempo against it (0.6 to 1.6 times, in steps of about 5%) is a state,
 * and the follower keeps the probability of each: the forward algorithm of
 * a hidden Markov model, the way score followers have tracked live players
 * since Orio and Déchelle (2001) and Cont's Antescofo, on the place-by-tempo
 * grid of Whiteley, Cemgil and Godsill's bar-pointer model (2006). Each hop
 * every state moves on by its tempo, a little of each tempo's weight leaks
 * to the tempos either side (a band drifts), and each is weighed by how well
 * the map there sounds like the room now.
 *
 * Why not online time warping, which the PLAN named first: it is the right
 * tool for one path through one timeline, and a live take is not one path
 * through the recording's. A chorus played twice goes back; a verse left out
 * jumps forward; a solo stretched goes round its own bars again. A warping
 * path is monotonic by construction. Here the form is in the transitions:
 * at the end of each of the map's sections most of the weight goes on to the
 * next, as the recording did, and some to the start of any section,
 * this one again included (the model the PLAN asks for: "sections that may
 * repeat, stretch or be skipped, not one timeline"). And a little of the
 * weight leaks everywhere every hop, so a jump the form did not offer, or a
 * band that starts in the middle, is found anyway: from the leak, the right
 * place outgrows the wrong one in a couple of seconds of sounding right.
 * Today the leak does nearly all of that work. The map's sections are the
 * worker's guess and coarse (`npm run songfollow` prints them: one "chorus"
 * over a verse, a chorus, a verse and a chorus), so the jumps land at the
 * wrong places; with no jumps at all the check's numbers are the same, and
 * with the record's true sections a repeated chorus is found 1.2 bars in
 * against 1.4. Better sections are PLAN.md 28g-4.
 *
 * Why not particles, which were tried first (a sequential Monte Carlo
 * follower after Montecchio and Cont, 2011): with a hop's evidence as sharp
 * as a chord's, resampling every hop threw away the history, and the
 * guesses went wherever the last second's chords happened to be played
 * (measured on the take 15% slower: 16% of hops within a bar of the place).
 * The grid keeps the whole history exactly, costs about 25,000 multiplies a
 * hop for a five-minute song, and is the same every time.
 *
 * What it reports, and why confidence is two things. `position` is where
 * most of the weight is. Confidence asks two questions: does the map at that
 * place sound like the room (`quality`, the correlation of the two profiles,
 * held over about three seconds as it falls and half that as it rises), and
 * do the guesses agree (`agreement`, the weight within a beat or two of the
 * same place in a section of the same kind; a chorus heard twice in the map
 * is two places that sound the same, and being unsure which chorus this is
 * is not being lost). A jam on chords
 * the song never had fails the first; a vamp on chords the song has in
 * several places fails the second. When confidence is low, the show should
 * fall back on what it hears live (`songShape.ts`); `followedPlace.ts`
 * does that, and is what the show reads (PLAN.md 28g-2).
 *
 * Measured by `npm run songfollow`.
 */

import type { AudioReading } from './audioFeatures.ts';
import { AnalyserEmulator } from './audioFeatures.ts';
import { centreChroma, ChromaEar } from './chroma.ts';

/** Profiles a second, in the map and in the room. A bar at 120 bpm is eight. */
export const FOLLOW_RATE = 4;
/** The map's bins the width of the room's: the analyser's 1024 points at 44.1 kHz are 43 Hz wide. */
export const FOLLOW_BIN_HZ = 44100 / 1024;

/** Tempos against the map: TEMPO_STEPS of them, geometric, from TEMPO_MIN to TEMPO_MAX. A take 15% slower is 0.85. */
const TEMPO_MIN = 0.6, TEMPO_MAX = 1.6, TEMPO_STEPS = 21;
/** How sharply a place is preferred for sounding like the room: likelihood exp(SHARPNESS·(r − 1)) for correlation r, every hop. */
const SHARPNESS = 3;
/** Of the weight reaching the end of a section, the share that goes to the start of a section other than the next. */
const JUMP_AT_END = 0.15;
/** Each hop, the share of all the weight spread evenly over every state (a jump the form did not offer, a mid-song start). */
const LEAK = 1e-3;
/** Each hop, the share of each tempo's weight that moves to each tempo beside it. */
const TEMPO_DRIFT = 0.04;
/** Confidence at and over which the tempo heard is taken as the band's (see `step`, "lost"). */
const TEMPO_KNOWN_AT = 0.5;
/** Confidence under which the follower is lost, and the band's tempo is held at what was known. */
const TEMPO_LOST = 0.2;
/** The band's tempo is remembered over this many seconds of being followed. */
const TEMPO_KNOWN_SEC = 4;
/** Quality held over this many seconds as it falls, and this many as it rises (see `estimate`). */
const QUALITY_SEC = 3, QUALITY_RISE_SEC = 1.5;
/** Correlation at and under which the room is not this song at all, and at and over which it plainly is. */
const QUALITY_NONE = 0.3, QUALITY_SURE = 0.7;
/** Agreement counts the guesses within this many seconds of the reported place, in a section of the same kind. */
const AGREE_SEC = 1.5;

export interface FollowMap {
  /** FOLLOW_RATE profiles a second, twelve each, as `mapChroma` returns them. */
  chroma: ArrayLike<number>;
  /** Its sections, in the map's seconds; `label` says which are the same kind (two choruses). */
  sections: { start: number; end: number; label: string }[];
}

export interface FollowState {
  /** Where in the map the room is, seconds, or null before anything harmonic was heard. */
  position: number | null;
  /** The section of the map that holds it, index into the map's sections. */
  section: number;
  /** How fast the room plays against the map: 1.15 is 15% faster. */
  tempo: number;
  /** 0..1: how sure. Under about a third, lean on the live song shape, not the map. */
  confidence: number;
  /** The two parts of it (see the header). */
  quality: number;
  agreement: number;
}

/** The map is heard at the show's own 60 frames a second: fifteen of the analyser's frames a hop. */
const MAP_FRAMES_PER_HOP = 15;

/**
 * The map's side: the harmony of a recorded listen, FOLLOW_RATE profiles a
 * second, each the mean of the analyser's frames over its quarter second,
 * heard by the same arithmetic as the room (`AnalyserEmulator`, `ChromaEar`)
 * at an FFT size giving bins about FOLLOW_BIN_HZ wide at this sample rate.
 */
export function mapChroma(pcm: Float32Array, sampleRate: number): Float32Array {
  const fftSize = Math.pow(2, Math.round(Math.log2(sampleRate / FOLLOW_BIN_HZ)));
  const analyser = new AnalyserEmulator(sampleRate, fftSize);
  const ear = new ChromaEar();
  const sub = MAP_FRAMES_PER_HOP, dt = 1 / (FOLLOW_RATE * sub);
  const frames = Math.floor((pcm.length / sampleRate) * FOLLOW_RATE);
  const out = new Float32Array(frames * 12);
  const one = new Float64Array(12);
  for (let f = 0; f < frames; f++) {
    for (let s = 1; s <= sub; s++) {
      const t = (f + s / sub) / FOLLOW_RATE;
      const { bins } = analyser.frame(pcm, Math.round(t * sampleRate), dt);
      ear.push(bins, sampleRate / fftSize, t, one);
      for (let i = 0; i < 12; i++) out[f * 12 + i] += one[i] / sub;
    }
  }
  return out;
}

/**
 * The map's profiles as they are kept with the song map (IndexedDB): three
 * decimals. Four profiles a second of a five-minute song is 14,400 numbers,
 * each a note's share of its frame, about 0.08; two decimals would be an
 * eighth of a typical share, three is under what the ear's own frame-to-
 * frame wobble is. `npm run songfollow` follows the stored form, not the exact.
 */
export function storedChroma(chroma: Float32Array): number[] {
  return Array.from(chroma, x => Math.round(x * 1000) / 1000);
}

export class SongFollower {
  private readonly map: Float32Array;
  private readonly frames: number;
  private readonly sections: { start: number; end: number; label: string }[];
  /** For each frame, its section, and the frame its section ends at. */
  private readonly sectionOfFrame: Int32Array;
  private readonly startFrame: Int32Array;
  private readonly endFrame: Int32Array;
  private readonly rates: Float64Array;
  /** The weight of each state, tempo-major: `alpha[k * frames + i]`. */
  private alpha: Float64Array;
  private next: Float64Array;
  private readonly held: Float64Array;
  private readonly like: Float64Array;
  private readonly marginal: Float64Array;
  /** The room's profile summed over the hop so far, and how many readings went in. */
  private readonly sum = new Float64Array(12);
  private count = 0;
  private hopStart: number | null = null;
  private readonly live = new Float64Array(12);
  private heard = false;
  private qualityHeld = 0;
  /** The band's tempo as last known while followed: a weight per tempo, or null before it was ever followed. */
  private tempoKnown: Float64Array | null = null;
  private readonly tempoHere = new Float64Array(TEMPO_STEPS);
  readonly now: FollowState = { position: null, section: -1, tempo: 1, confidence: 0, quality: 0, agreement: 0 };
  /** Hops made so far: `now` is updated in place, and changes only when this does (or on `anchor`). */
  hops = 0;

  constructor(map: FollowMap) {
    const N = this.frames = Math.max(1, Math.floor(map.chroma.length / 12));
    this.map = new Float32Array(N * 12);
    const v = new Float64Array(12), c = new Float64Array(12);
    for (let f = 0; f < Math.floor(map.chroma.length / 12); f++) {
      for (let i = 0; i < 12; i++) v[i] = map.chroma[f * 12 + i];
      centreChroma(v, c);
      for (let i = 0; i < 12; i++) this.map[f * 12 + i] = c[i];
    }
    const duration = N / FOLLOW_RATE;
    const given = map.sections.filter(s => s.end > s.start && s.start < duration);
    this.sections = given.length ? given : [{ start: 0, end: duration, label: 'song' }];
    const S = this.sections.length;
    this.startFrame = new Int32Array(S);
    this.endFrame = new Int32Array(S);
    for (let j = 0; j < S; j++) {
      this.startFrame[j] = Math.min(N - 1, Math.max(0, Math.round(this.sections[j].start * FOLLOW_RATE)));
      this.endFrame[j] = j + 1 < S ? Math.max(this.startFrame[j] + 1, Math.round(this.sections[j + 1].start * FOLLOW_RATE)) : N;
    }
    this.sectionOfFrame = new Int32Array(N);
    for (let i = 0, j = 0; i < N; i++) {
      while (j + 1 < S && i >= this.startFrame[j + 1]) j++;
      this.sectionOfFrame[i] = j;
    }
    this.rates = Float64Array.from({ length: TEMPO_STEPS }, (_, k) => TEMPO_MIN * Math.pow(TEMPO_MAX / TEMPO_MIN, k / (TEMPO_STEPS - 1)));
    // Where the room starts: half the weight on the map's first section,
    // half anywhere. The follower is armed when a song is recognised or
    // chosen, which is most often at its start; but a band joined mid-song,
    // or a song recognised a minute in, must be found too. Without the half
    // at the start, a song whose first verse and second verse are the same
    // chords is followed in its second verse until the form tells them
    // apart (measured: the take 15% slower spent its first 35 s a verse
    // ahead, 79% of hops at the very place).
    this.alpha = new Float64Array(TEMPO_STEPS * N).fill(0.5 / (TEMPO_STEPS * N));
    const first = Math.max(1, this.endFrame[0]);
    for (let k = 0; k < TEMPO_STEPS; k++) for (let i = 0; i < first; i++) this.alpha[k * N + i] += 0.5 / (TEMPO_STEPS * first);
    this.next = new Float64Array(TEMPO_STEPS * N);
    this.held = new Float64Array(TEMPO_STEPS * N);
    this.like = new Float64Array(N);
    this.marginal = new Float64Array(N);
  }

  /**
   * The operator says where the room is: `mapSec` in the map's seconds (the
   * score's nudge, PLAN.md 28h, "the next section is now"). Half the weight
   * goes to that place, at the tempos the follower already believes; the
   * rest stays where it was, so a nudge into the wrong place is undone by
   * what is heard rather than trusted for ever.
   */
  anchor(mapSec: number): void {
    const N = this.frames, K = TEMPO_STEPS, a = this.alpha;
    const f = Math.max(0, Math.min(N - 1, Math.floor(mapSec * FOLLOW_RATE)));
    const tempo = new Float64Array(K);
    let total = 0;
    for (let k = 0; k < K; k++) for (let i = 0; i < N; i++) { tempo[k] += a[k * N + i]; total += a[k * N + i]; }
    for (let s = 0; s < N * K; s++) a[s] *= 0.5 / (total || 1);
    for (let k = 0; k < K; k++) a[k * N + f] += 0.5 * (total > 0 ? tempo[k] / total : 1 / K);
    this.heard = true;
    this.estimate(false);
  }

  /** Feed one of the ear's readings (every frame, any frame rate). */
  update(reading: Pick<AudioReading, 'time' | 'chroma'>): FollowState {
    const t = reading.time;
    if (this.hopStart === null) this.hopStart = t;
    for (let i = 0; i < 12; i++) this.sum[i] += reading.chroma[i];
    this.count++;
    // A hop is a quarter second of the room, however many frames that was:
    // 15 at 60 fps, 7 or 8 at 30. A gap in the readings (a stalled tab)
    // carries every state forward by the time that passed.
    if (t - this.hopStart >= 1 / FOLLOW_RATE) {
      const dt = t - this.hopStart;
      for (let i = 0; i < 12; i++) this.sum[i] /= this.count;
      const harmonic = centreChroma(this.sum, this.live);
      this.step(dt, harmonic);
      this.hops++;
      this.sum.fill(0);
      this.count = 0;
      this.hopStart = t;
    }
    return this.now;
  }

  /** The room's profile against the map's frame `f`: their correlation, -1..1. */
  private match(f: number): number {
    const o = Math.max(0, Math.min(this.frames - 1, f)) * 12;
    let d = 0;
    for (let i = 0; i < 12; i++) d += this.live[i] * this.map[o + i];
    return d;
  }

  /** Put weight `w` at frame position `x` (fractional) of tempo row `row`, split between the two frames either side. */
  private put(row: number, x: number, w: number): void {
    const N = this.frames;
    const lo = Math.floor(x), frac = x - lo;
    if (lo < N) this.next[row + lo] += w * (1 - frac);
    if (lo + 1 < N) this.next[row + lo + 1] += w * frac;
    else if (lo < N) this.next[row + lo] += w * frac;
  }

  private step(dt: number, harmonic: boolean): void {
    const N = this.frames, K = TEMPO_STEPS, S = this.sections.length;
    const a = this.alpha, nx = this.next;
    // Nothing harmonic heard (a break, a bar of silence, the drums alone):
    // the band may be playing on through it or may have stopped, and the
    // two are told apart only by where the harmony comes back. So half of
    // every state's weight waits where it is. Without it, a bar of silence
    // the record did not have was explained the only other way the model
    // could, as the band slowing down: measured on the take that speeds up
    // through the song, the solo after its bar of silence read 1.01 of its
    // true 1.08 for half the solo.
    if (!harmonic) this.held.set(a);
    nx.fill(0);
    // Move every state on by its tempo; at a section's end, on to the next
    // section, or (JUMP_AT_END of it) to the start of any.
    for (let k = 0; k < K; k++) {
      const row = k * N, adv = this.rates[k] * dt * FOLLOW_RATE;
      for (let i = 0; i < N; i++) {
        const w = a[row + i];
        if (w < 1e-300) continue;
        const x = i + adv;
        const j = this.sectionOfFrame[i];
        const end = this.endFrame[j];
        if (x < end) { this.put(row, x, w); continue; }
        const over = x - end;
        const onward = j + 1 < S ? 1 - JUMP_AT_END : 0;
        if (onward > 0) this.put(row, Math.min(this.endFrame[j + 1] - 1, this.startFrame[j + 1] + over), w * onward);
        const each = (w * (1 - onward)) / S;
        for (let s = 0; s < S; s++) this.put(row, Math.min(this.endFrame[s] - 1, this.startFrame[s] + over), each);
      }
    }
    // Tempo drifts, and a little of everything goes everywhere.
    let total = 0;
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < K; k++) {
        const here = nx[k * N + i];
        const down = k > 0 ? nx[(k - 1) * N + i] : 0, up = k + 1 < K ? nx[(k + 1) * N + i] : 0;
        const stay = here * (1 - TEMPO_DRIFT * ((k > 0 ? 1 : 0) + (k + 1 < K ? 1 : 0)));
        a[k * N + i] = stay + TEMPO_DRIFT * (down + up);
        total += a[k * N + i];
      }
    }
    if (!harmonic) {
      total = 0;
      for (let s = 0; s < N * K; s++) { a[s] = 0.5 * a[s] + 0.5 * this.held[s]; total += a[s]; }
    }
    const leak = (LEAK * total) / (N * K);
    for (let s = 0; s < N * K; s++) a[s] = a[s] * (1 - LEAK) + leak;
    if (harmonic) {
      this.heard = true;
      for (let i = 0; i < N; i++) this.like[i] = Math.exp(SHARPNESS * (this.match(i) - 1));
      for (let k = 0; k < K; k++) for (let i = 0; i < N; i++) a[k * N + i] *= this.like[i];
    }
    total = 0;
    for (let s = 0; s < N * K; s++) total += a[s];
    if (!(total > 0)) a.fill(1 / (N * K));
    else for (let s = 0; s < N * K; s++) a[s] /= total;
    /*
      Lost (a jam the song never had, a song that is not this one): what is
      heard says where the map sounds most like the room, and nothing about
      how fast the band plays. Left alone, the weight ran to the slowest
      tempo: in a jam every chord the band plays is somewhere in the map (its
      E is the chorus's last chord), and a state that barely moves sits on
      such a place for longest, so the slow states outlived the rest. Measured
      on the check's jam: the tempo 0.99 going in, 0.63 two bars later and
      0.62 at the chorus after, sixteen bars on, which the follower then
      followed at 0.62 for two bars before losing it again. So while lost,
      each place's weight is spread over the tempos as the band was last
      known to play, half of it a hop; where the place is, it still decides.
      With it the tempo is 0.95 through the jam, and the jam reads as one:
      confidence 0.11 in it against 0.17 without, and the place the show
      reads (`followedPlace.ts`) unsure on 107 of its 112 hops against 95,
      where the rest were the place jumping to wherever the slow states sat
      (5.3 bars, `npm run songfollow`).
    */
    const known = this.tempoKnown;
    if (known && this.now.confidence < TEMPO_LOST) {
      for (let i = 0; i < N; i++) {
        let w = 0;
        for (let k = 0; k < K; k++) w += a[k * N + i];
        for (let k = 0; k < K; k++) a[k * N + i] = 0.5 * a[k * N + i] + 0.5 * w * known[k];
      }
    }
    this.estimate(harmonic);
  }

  private estimate(heardNow: boolean): void {
    if (!this.heard) return;
    const N = this.frames, K = TEMPO_STEPS, a = this.alpha, m = this.marginal;
    m.fill(0);
    for (let k = 0; k < K; k++) for (let i = 0; i < N; i++) m[i] += a[k * N + i];
    // The place: the stretch of AGREE_SEC either side holding the most
    // weight, then the weighted mean of the frames in it.
    const r = Math.round(AGREE_SEC * FOLLOW_RATE);
    let run = 0;
    for (let i = 0; i < Math.min(N, r + 1); i++) run += m[i];
    let best = 0, bestW = run;
    for (let c = 1; c < N; c++) {
      if (c + r < N) run += m[c + r];
      if (c - r - 1 >= 0) run -= m[c - r - 1];
      if (run > bestW) { bestW = run; best = c; }
    }
    let sw = 0, sx = 0, st = 0;
    const th = this.tempoHere;
    th.fill(0);
    for (let i = Math.max(0, best - r); i <= Math.min(N - 1, best + r); i++) {
      sw += m[i]; sx += m[i] * i;
      for (let k = 0; k < K; k++) { st += a[k * N + i] * Math.log(this.rates[k]); th[k] += a[k * N + i]; }
    }
    const f = sw > 0 ? sx / sw : best;
    const fi = Math.round(f);
    const sec = this.sectionOfFrame[Math.max(0, Math.min(N - 1, fi))];
    const into = fi - this.startFrame[sec];
    // Agreement: the weight on the same place in any section of this kind.
    let agree = 0;
    const label = this.sections[sec].label;
    for (let s = 0; s < this.sections.length; s++) {
      if (this.sections[s].label !== label) continue;
      const c = this.startFrame[s] + into;
      for (let i = Math.max(this.startFrame[s], c - r); i <= Math.min(this.endFrame[s] - 1, c + r); i++) agree += m[i];
    }
    // Quality falls over QUALITY_SEC and rises over half that: a band back
    // from a jam is the song again as soon as it sounds like it for a bar,
    // and the show should not wait out three seconds of jam in the average
    // before believing it. Measured on the check's jam: the place the show
    // reads was sure of the chorus after it 5.4 bars in with one rate, 1.8
    // with these two; the jam's own confidence stays under 0.3 (0.11).
    if (heardNow) {
      const now = this.match(fi);
      const q = Math.min(1, (1 / FOLLOW_RATE) / (now > this.qualityHeld ? QUALITY_RISE_SEC : QUALITY_SEC));
      this.qualityHeld += q * (now - this.qualityHeld);
    }
    const qn = Math.min(1, Math.max(0, (this.qualityHeld - QUALITY_NONE) / (QUALITY_SURE - QUALITY_NONE)));
    const n = this.now;
    // A frame's profile is the quarter second after its time, and the hop
    // just heard ended now: the room is at the end of the frame it matched.
    n.position = (f + 1) / FOLLOW_RATE;
    n.section = sec;
    n.tempo = sw > 0 ? Math.exp(st / sw) : 1;
    n.quality = this.qualityHeld;
    n.agreement = Math.min(1, agree);
    n.confidence = qn * Math.min(1, agree / 0.6);
    // The band's tempo while followed, for when it is lost (see `step`).
    if (heardNow && n.confidence >= TEMPO_KNOWN_AT && sw > 0) {
      if (!this.tempoKnown) this.tempoKnown = Float64Array.from(th, x => x / sw);
      else {
        const l = 1 - Math.exp(-1 / (FOLLOW_RATE * TEMPO_KNOWN_SEC));
        for (let k = 0; k < K; k++) this.tempoKnown[k] += l * (th[k] / sw - this.tempoKnown[k]);
      }
    }
  }
}
