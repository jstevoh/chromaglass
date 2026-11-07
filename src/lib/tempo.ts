/**
 * Somewhere to get the tempo from besides the microphone.
 *
 * The beat clock listens to onsets and does it well, and on a stage with a
 * clean aux send from the desk that is the right answer — it needs nothing
 * plugged in and it follows a band that speeds up. But onset detection is
 * still a guess, and there are rooms where the guess is hard: a loud bar
 * where the microphone hears the crowd as much as the kick, a DJ set where
 * the low end never stops, a rehearsal against Ableton where the tempo is
 * already a known number sitting on the other side of a cable.
 *
 * So: ways to tell the show the tempo instead of making it work the
 * tempo out.
 *
 *   **MIDI clock** — twenty-four pulses a quarter note, on the port that is
 *   already open for the faders. Nothing to set up: if the desk is sending
 *   clock, the show is locked to it.
 *
 *   **Tap** — four taps on a pad or a key. What every VJ reaches for when
 *   the room is fighting the microphone, and the one thing this app made
 *   impossible (the APC40's Tap Tempo button is drawn on the controller
 *   picture and has never had anything behind it).
 *
 *   **A typed number** — when the tempo is on the setlist.
 *
 *   **Ableton Link** — the session Live, Bitwig, Traktor or an iPad's AUM
 *   share on the network, through the show server (a page cannot join it;
 *   `server/abletonLink.js`). Tempo and phase with no cable, and it wins
 *   over the others while it is speaking.
 *
 * A source that knows the tempo sets both the period *and* the phase, which
 * is the part that matters: a beat clock with the right tempo and the wrong
 * phase puts every kick exactly half a beat late.
 *
 * The audio clock is never turned off by any of this. It keeps listening,
 * and taking over again is one button.
 */

export type TempoSourceKind = 'clock' | 'tap' | 'manual' | 'link';

/** Ableton Link as the page knows it: whether the show server offers it, whether it is on, and how many others are in the session. */
export interface LinkStatus {
  available: boolean;
  on: boolean;
  peers: number;
  /** The show server is not Pro, so it will not join (PLAN.md 13.5-link-gate). */
  locked?: boolean;
  /** Whether Live's play and stop move the Sequence (13.5-link-transport); the desk's switch. */
  follows?: boolean;
}

/** What the desk shows of the tempo, sampled from the source four times a second (`useTempo`). */
export interface TempoLabel {
  source: string | null;
  bpm: number;
  taps: number;
  link?: LinkStatus;
}

/** The show server's Link message (`server/abletonLink.js`, `remoteProtocol.ts`). */
export interface LinkMessage {
  on: boolean;
  peers: number;
  bpm: number;
  beat: number | null;
  /** The session's transport: Live playing or stopped. */
  playing?: boolean;
  /** Off because the show server is not Pro. */
  locked?: boolean;
}

/** A change in the Link session's transport, as `TempoSource.linkReading` hands it back. */
export type LinkTransportEdge = 'start' | 'stop' | null;

export interface TempoReading {
  /** Milliseconds per beat. */
  period: number;
  /**
   * When a beat last fell, as `performance.now()` — or null for a source that
   * knows the tempo but not where the bar is (a typed number), which leaves
   * the beat clock's own phase alone.
   */
  beatAt: number | null;
  source: TempoSourceKind;
  /** Bumped on every fresh beat, so a reader can tell a new one from a held one. */
  seq: number;
  /**
   * That beat's place in the bar, 0 being the one, from a source that knows
   * the bar (Link, whose session agrees on it in fours); absent otherwise.
   * The bar grid takes it as the one (`BarGrid.tell`, PLAN 13.5-link-one).
   */
  bar?: number;
}

/** The same range the beat clock works in: 60 to 200 bpm. */
const MIN_PERIOD = 300;
const MAX_PERIOD = 1000;

/** MIDI clock is twenty-four pulses to the quarter note. Always. */
const PPQ = 24;

/**
 * How long a MIDI clock is believed after the last pulse.
 *
 * At the slowest tempo in range a pulse arrives every 42ms, so a fifth of a
 * second is five missed pulses — a cable out, a desk stopped, a laptop that
 * went to sleep. Long enough not to drop out on a scheduling hiccup, short
 * enough that a stopped clock hands back within a beat.
 */
const CLOCK_HOLD = 400;

/** Taps more than this far apart are a new attempt, not a slower tempo. */
const TAP_GAP = 2500;
/** Two taps closer than this are one press arriving twice. */
const DOUBLE_TAP_MS = 25;

/**
 * How long a Link reading is believed after the last one. The show server
 * sends twenty a second, so this is twenty missed: a server gone, the session
 * left. Then the clock hands back, as a stopped MIDI clock does.
 */
const LINK_HOLD = 1000;
/**
 * How far the beat's anchor may creep later per reading, ms.
 *
 * Each reading is stamped when it arrives, and one that sat behind a frame
 * arrives late, which reads as a beat that fell late. So the anchor keeps the
 * *earliest* arrival (the least delayed) and creeps toward later ones only by
 * this much: a hundredth of a millisecond a reading, a fifth of one a second.
 * The server's clock and the page's are the same machine's monotonic clock, so
 * there is no drift to follow worth the name; the creep is for Link's own
 * re-measurement every thirty seconds, which can move the session's offset by
 * microseconds. A twentieth of a millisecond a reading (one a second) was tried
 * first: readings up to a frame late then left the beat up to 2.3 ms late
 * (`npm run link`), against 0.86 ms at worst now.
 */
const LINK_CREEP = 0.01;

const clampPeriod = (ms: number) => Math.max(MIN_PERIOD, Math.min(MAX_PERIOD, ms));

/**
 * Fold an interval into the 60–200 bpm range by halving or doubling.
 *
 * Zero and anything not finite go back unchanged rather than into the loop:
 * doubling zero never reaches the minimum, so this spun for ever and took the
 * tab with it. Two taps can genuinely share a millisecond — a pad that sends
 * its note twice, a button bound both on the controller and under a finger.
 * The caller treats a non-positive result as "no tempo yet".
 */
const fold = (ms: number): number => {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  let p = ms;
  while (p > MAX_PERIOD) p /= 2;
  while (p < MIN_PERIOD) p *= 2;
  return p;
};

/** The source's name on the desk and the phone. */
export const tempoSourceName = (source: string | null): string =>
  source === 'clock' ? 'midi clock' : source === 'tap' ? 'tapped' : source === 'link' ? 'Link' : 'set';

/** What Link is doing, in a few words beside its switch. */
export function linkLine(link: LinkStatus): string {
  if (link.locked) return 'part of Pro';
  if (!link.on) return 'off';
  if (link.peers === 0) return 'looking for a session on this network';
  return link.peers === 1 ? 'following 1 app' : `following ${link.peers} apps`;
}

export const bpmOf = (period: number): number => (period > 0 ? 60000 / period : 0);
export const periodOf = (bpm: number): number => (bpm > 0 ? 60000 / bpm : 0);

export class TempoSource {
  private kind: TempoSourceKind | null = null;
  private period = 0;
  private beatAt: number | null = null;
  private seq = 0;

  // MIDI clock
  private pulses = 0;
  private lastPulseAt = -Infinity;
  /** The last few beat times, for a period that does not jitter with one late pulse. */
  private clockBeats: number[] = [];

  // Tap
  private taps: number[] = [];

  // Ableton Link, through the show server. Kept beside the other sources rather
  // than in `kind`, so a Link session that ends hands back to whatever was
  // tapped or typed before it, and a MIDI clock lapsing does not end Link.
  /** When beat zero fell on the page's clock, the true period, the last whole beat, and until when it is believed. */
  private link: { origin: number; period: number; whole: number; until: number } | null = null;
  private linkFresh = false;
  /** Whether a show server offers Link, whether it is on, and its peers, for the desk. */
  linkStatus: LinkStatus = { available: false, on: false, peers: 0 };
  /** Whether the operator wants Link on; the remote link asks the server for it on every connect. */
  linkWanted = false;
  /**
   * Whether the session's play and stop move the Sequence (PLAN.md
   * 13.5-link-transport). Off by default: a stopped transport in a DJ set,
   * between two tracks, is not the end of the show. Remembered by `useTempo`.
   */
  linkTransport = false;
  /** The session's transport at the last reading, or null while not in one. */
  private linkWasPlaying: boolean | null = null;
  /** Set by the remote link: asks the show server to switch Link on or off. */
  onLinkSwitch: ((on: boolean) => void) | null = null;

  /** What is driving the tempo right now, or null when nothing is. */
  get active(): TempoSourceKind | null {
    return this.linkFresh ? 'link' : this.kind;
  }

  /** Beats per minute of whatever is driving, or 0. */
  get bpm(): number {
    if (this.linkFresh && this.link) return bpmOf(this.link.period);
    return this.kind ? bpmOf(this.period) : 0;
  }

  /** Link on or off at the show server, remembered as the operator's wish. */
  switchLink(on: boolean): void {
    this.linkWanted = on;
    this.onLinkSwitch?.(on);
  }

  /**
   * A Link message from the show server, stamped `now` on arrival.
   *
   * Link says which beat it is (a fraction of one included) rather than when a
   * beat fell, so the moment beat zero fell is worked back from the stamp:
   * `now - beat * period`. That is right to within how late the message
   * arrived, which on one machine is under a millisecond for the socket and up
   * to a frame for the page's event loop; LINK_CREEP keeps the least late.
   */
  linkReading(now: number, m: LinkMessage): LinkTransportEdge {
    this.linkStatus = { available: true, on: m.on, peers: m.on ? m.peers : 0, ...(m.locked ? { locked: true } : {}) };
    if (!m.on || m.beat === null || !(m.bpm > 0) || !Number.isFinite(m.beat)) {
      this.link = null;
      this.linkFresh = false;
      this.linkWasPlaying = null;
      return null;
    }
    // The transport's edge: only between two readings that were both in a
    // session, so joining one that is already stopped stops nothing.
    const playing = m.playing === true;
    const was = this.linkWasPlaying;
    this.linkWasPlaying = playing;
    const edge: LinkTransportEdge = was === null || was === playing ? null : playing ? 'start' : 'stop';
    const period = periodOf(m.bpm);
    const origin = now - m.beat * period;
    const l = this.link;
    if (l && Math.abs(l.period - period) < 1e-6 * period && Math.abs(origin - l.origin) < period / 4) {
      l.origin = Math.min(l.origin + LINK_CREEP, origin);
      l.until = now + LINK_HOLD;
    } else {
      // A new session, a tempo change or a jump in the bar: the anchor starts again.
      this.link = { origin, period, whole: l?.whole ?? Number.NaN, until: now + LINK_HOLD };
    }
    return edge;
  }

  /** How many taps are in the current attempt, for a button that counts them in. */
  get tapCount(): number {
    return this.taps.length;
  }

  /**
   * The reading, or null when nothing outside is speaking.
   *
   * `now` is passed in rather than read here so the whole show agrees about
   * what time it is, and so this can be tested without a clock.
   */
  read(now: number): TempoReading | null {
    // A MIDI clock that has stopped sending stops being the tempo. Tap and a
    // typed number are deliberate acts and stay until they are replaced or
    // cleared — an operator who tapped a tempo did not mean "for four seconds".
    if (this.kind === 'clock' && now - this.lastPulseAt > CLOCK_HOLD) this.clear();
    // Link first: the session is the room's tempo, shared with the band's own
    // gear, and a tap or a typed number under it waits for it to end.
    const l = this.link;
    this.linkFresh = !!l && now < l.until;
    if (l && this.linkFresh) {
      const beats = (now - l.origin) / l.period;
      const whole = Math.floor(beats);
      if (whole !== l.whole) { l.whole = whole; this.seq++; }
      // Not folded: Link means the tempo it says, as a MIDI clock does.
      return { period: clampPeriod(l.period), beatAt: l.origin + whole * l.period, source: 'link', seq: this.seq, bar: ((whole % 4) + 4) % 4 };
    }
    if (!this.kind || this.period <= 0) return null;
    return { period: this.period, beatAt: this.beatAt, source: this.kind, seq: this.seq };
  }

  /** Back to listening: the microphone's own beat clock takes over again. */
  clear(): void {
    this.kind = null;
    this.period = 0;
    this.beatAt = null;
    this.pulses = 0;
    this.lastPulseAt = -Infinity;
    this.clockBeats = [];
    this.taps = [];
  }

  /**
   * One MIDI clock pulse (0xF8).
   *
   * Twenty-four of them is a beat. The period comes from the span across the
   * last few beats rather than from one, because a pulse arriving late — and
   * they do, through a USB stack and a browser's event loop — would otherwise
   * shorten one beat and lengthen the next.
   */
  clockPulse(now: number): void {
    this.lastPulseAt = now;
    if (++this.pulses < PPQ) return;
    this.pulses = 0;
    this.clockBeats.push(now);
    while (this.clockBeats.length > 5) this.clockBeats.shift();
    if (this.clockBeats.length >= 2) {
      const span = this.clockBeats[this.clockBeats.length - 1] - this.clockBeats[0];
      const period = span / (this.clockBeats.length - 1);
      // Not folded: a desk sending clock means the tempo it says, even if that
      // is 50 or 210 bpm, so this is clamped into what the solver can pulse at
      // rather than silently halved.
      this.period = clampPeriod(period);
      this.kind = 'clock';
      this.beatAt = now;
      this.seq++;
    }
  }

  /** Song position back to the top (0xFA / 0xFB): the next pulse begins a beat. */
  clockStart(now: number): void {
    this.pulses = 0;
    this.lastPulseAt = now;
    this.clockBeats = this.period > 0 ? [now] : [];
    if (this.period > 0) {
      this.beatAt = now;
      this.kind = 'clock';
      this.seq++;
    }
  }

  /** The desk stopped (0xFC). Hand back rather than coast on a tempo nobody is playing. */
  clockStop(): void {
    if (this.kind === 'clock') this.clear();
  }

  /**
   * A tap. Two give a tempo, four give a good one.
   *
   * Each tap is also a beat, so the phase lands on the operator's hand — tap
   * on the downbeats and the plate is pressed on the downbeats.
   */
  tap(now: number): void {
    const last = this.taps.length ? this.taps[this.taps.length - 1] : -Infinity;
    if (now - last > TAP_GAP) this.taps = [];
    // A second tap within a fortieth of a second is not a tempo of 1500 bpm,
    // it is one press arriving twice — a pad that double-fires, or a button
    // bound on the controller *and* under a finger on the screen. Swallowed
    // rather than folded into the average it would ruin.
    else if (now - last < DOUBLE_TAP_MS) return;
    this.taps.push(now);
    while (this.taps.length > 8) this.taps.shift();
    if (this.taps.length < 2) {
      // The first tap is still a beat: it sets the phase of whatever tempo is
      // already running, which is how a light show gets back on the bar after
      // a fill without retyping anything.
      if (this.kind) { this.beatAt = now; this.seq++; }
      return;
    }
    const ivs: number[] = [];
    for (let i = 1; i < this.taps.length; i++) ivs.push(this.taps[i] - this.taps[i - 1]);
    const mean = ivs.reduce((s, v) => s + v, 0) / ivs.length;
    const folded = fold(mean);
    if (folded <= 0) return;             // nothing usable in these taps yet
    this.period = clampPeriod(folded);
    this.kind = 'tap';
    this.beatAt = now;
    this.seq++;
  }

  /** A number off the setlist. No phase: the clock keeps whatever bar it is on. */
  setBpm(bpm: number): void {
    const period = periodOf(bpm);
    if (!(period > 0)) { if (this.kind === 'manual') this.clear(); return; }
    this.period = clampPeriod(period);
    this.kind = 'manual';
    this.beatAt = null;
    this.taps = [];
    this.seq++;
  }
}
