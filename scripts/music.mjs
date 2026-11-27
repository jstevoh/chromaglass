#!/usr/bin/env node
/**
 * Does the show keep time with the song playing?
 *
 *   npm run music
 *
 * The beat clock against a typed tempo and a loud room, and On a New Song's
 * default. (The local matcher naming songs it had heard before was checked
 * here too until automatic song identification was retired on 2026-11-27;
 * those checks are in archive/song-id/scripts/music.mjs.) Where one song
 * ends and the next begins is `npm run songends`, on recordings of real songs.
 */

import { TempoSource, bpmOf } from '../src/lib/tempo.ts';
import { BeatClock, LevelOnsets } from '../src/lib/beatClock.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';

let failed = 0;
const checks = [];

/*
  The gap between songs used to be measured here, on level traces made up for
  it: a CD's two seconds, a streaming service's one, a crossfade's none. It is
  measured now on recordings of real songs joined the ways players join them,
  in a quiet room and a noisy one, with whole songs that must not trigger
  (`npm run songends`, PLAN 14z): made-up traces had no song ending in its own
  decay, no last chord after a stop and no soft intro, which is where the old
  rule went wrong.
*/


// ── Naming the track: retired ─────────────────────────────────────
//
// The local matcher was checked here (naming songs heard before, never one
// it had not, through a mic, and the index grown a song at a time) until the
// owner retired automatic song identification on 2026-11-27. Those checks
// went with the matcher to archive/song-id/scripts/music.mjs, unchanged.
// ── Taking the tempo from somewhere that knows ──────────────────────
//
// Onset detection is a guess, and there are rooms where the guess is hard.
// A MIDI clock, a tap or a typed number is not a guess, and the thing that
// matters about all three is the *phase*: a clock with the right tempo and
// the wrong bar puts every kick half a beat late, which is worse than not
// being locked at all. So each of these checks where the beats land, not
// just how far apart they are.

console.log('\nTelling the show the tempo rather than making it work it out:\n');
{
  const FRAME = 1000 / 60;

  /** Run the clock for `seconds`, driven by `tempo`, and collect when it fired. */
  const runClock = ({ seconds, tempo, bass = () => 0, feed = () => {}, lead = 0 }) => {
    const clock = new BeatClock();
    // A synthetic bass level, heard where it crosses the clock's old line.
    const level = new LevelOnsets();
    const fired = [];
    for (let t = 0; t < seconds * 1000; t += FRAME) {
      feed(t, tempo);
      clock.setExternal(t, tempo ? tempo.read(t) : null);
      const tick = clock.update(t, level.at(t, bass(t)), 0, lead);
      if (tick.kick) fired.push(t);
    }
    return { clock, fired };
  };

  /** Intervals between fired beats, ignoring the first (the clock settling). */
  const spacing = (fired) => {
    const ivs = [];
    for (let i = 2; i < fired.length; i++) ivs.push(fired[i] - fired[i - 1]);
    return ivs;
  };
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const worst = (a, want) => (a.length ? Math.max(...a.map(v => Math.abs(v - want))) : Infinity);

  // A desk sending clock at 128 bpm: twenty-four pulses a beat, forever.
  {
    const PERIOD = 60000 / 128;
    const tempo = new TempoSource();
    let nextPulse = 0;
    const { clock, fired } = runClock({
      seconds: 12,
      tempo,
      feed: (t, tp) => { while (nextPulse <= t) { tp.clockPulse(nextPulse); nextPulse += PERIOD / 24; } },
    });
    const ivs = spacing(fired);
    const err = worst(ivs, PERIOD);
    console.log(`  midi clock, 128 bpm      locked ${bpmOf(clock.period).toFixed(1)} bpm, ${fired.length} beats, worst spacing error ${err.toFixed(1)} ms`);
    // One frame of slop: the clock can only fire on a frame boundary.
    checks.push(['a MIDI clock sets the tempo', Math.abs(bpmOf(clock.period) - 128) < 0.5]);
    checks.push(['and every beat lands where the clock says', err <= FRAME + 1]);
  }

  // The clock stops. The show must hand back rather than coast on a tempo
  // nobody is playing any more.
  {
    const PERIOD = 60000 / 128;
    const tempo = new TempoSource();
    let nextPulse = 0;
    const { clock } = runClock({
      seconds: 10,
      tempo,
      // Pulses for five seconds, then the cable comes out.
      feed: (t, tp) => { while (nextPulse <= t && nextPulse < 5000) { tp.clockPulse(nextPulse); nextPulse += PERIOD / 24; } },
    });
    const stillDriven = clock.driven(10000);
    console.log(`  the cable comes out      still driven after five seconds of nothing: ${stillDriven ? 'yes' : 'no'}`);
    checks.push(['a stopped MIDI clock hands back to the microphone', !stillDriven]);
  }

  // Four taps at 100 bpm. The tempo must come out right, and — the part that
  // matters — the beats must land on the taps, not somewhere between them.
  {
    const PERIOD = 600;                       // 100 bpm
    const tempo = new TempoSource();
    const taps = [2000, 2600, 3200, 3800];
    let next = 0;
    const { clock, fired } = runClock({
      seconds: 12,
      tempo,
      feed: (t, tp) => { while (next < taps.length && taps[next] <= t) tp.tap(taps[next++]); },
    });
    const after = fired.filter(t => t > 4200);
    // How far each fired beat is from the grid the taps set up.
    const offGrid = after.map(t => {
      const k = Math.round((t - taps[3]) / PERIOD);
      return Math.abs(t - (taps[3] + k * PERIOD));
    });
    const phaseErr = offGrid.length ? Math.max(...offGrid) : Infinity;
    console.log(`  four taps, 100 bpm       ${bpmOf(clock.period).toFixed(1)} bpm, ${after.length} beats, worst distance off the tapped grid ${phaseErr.toFixed(1)} ms`);
    checks.push(['four taps set the tempo', Math.abs(bpmOf(clock.period) - 100) < 1]);
    checks.push(['and the bar lands on the hand that tapped it', phaseErr <= FRAME + 1]);
  }

  // A control that fires twice.
  //
  // A pad that double-sends, or a button bound on the controller *and* under a
  // finger on the screen, puts two taps in the same millisecond. That used to
  // average to a zero interval, and folding zero into the tempo range doubles
  // it for ever: the tab hung. It also must not quietly poison a real tapped
  // tempo with a 1500 bpm interval.
  {
    const t = new TempoSource();
    t.tap(1000); t.tap(1000); t.tap(1000);
    const survived = t.active === null || t.bpm > 0;
    console.log(`  three taps in one instant  ${t.active ?? 'nothing'}${t.bpm ? ` at ${t.bpm.toFixed(1)} bpm` : ''}`);
    checks.push(['taps in the same instant do not hang the show', survived]);

    const u = new TempoSource();
    // 100 bpm, with the second press arriving twice.
    for (const at of [0, 10, 600, 1200, 1800]) u.tap(at);
    console.log(`  a tap that double-fired    ${u.bpm.toFixed(1)} bpm`);
    checks.push(['and a double-fired tap does not poison the tempo', Math.abs(u.bpm - 100) < 1]);
  }

  // A typed number: the tempo, and nothing said about the bar.
  {
    const tempo = new TempoSource();
    tempo.setBpm(140);
    const { clock, fired } = runClock({ seconds: 10, tempo });
    const err = worst(spacing(fired), 60000 / 140);
    console.log(`  a typed 140 bpm          ${bpmOf(clock.period).toFixed(1)} bpm, worst spacing error ${err.toFixed(1)} ms`);
    checks.push(['a typed tempo drives the clock', Math.abs(bpmOf(clock.period) - 140) < 0.5 && err <= FRAME + 1]);
  }

  // A loud room, off the grid. This is the whole reason to plug a clock in:
  // onsets that disagree with the desk must not drag the tempo around.
  {
    const PERIOD = 60000 / 128;
    const tempo = new TempoSource();
    let nextPulse = 0;
    // Bass that peaks on a *different* tempo entirely — a crowd, a monitor,
    // the previous song bleeding through the wall.
    const bass = (t) => (Math.sin((t / 1000) * 2 * Math.PI * 1.7) > 0.9 ? 1 : 0);
    const { clock } = runClock({
      seconds: 20,
      tempo,
      bass,
      feed: (t, tp) => { while (nextPulse <= t) { tp.clockPulse(nextPulse); nextPulse += PERIOD / 24; } },
    });
    const drift = Math.abs(bpmOf(clock.period) - 128);
    console.log(`  clock against a loud room ${bpmOf(clock.period).toFixed(1)} bpm after twenty seconds of onsets at 102 bpm (drift ${drift.toFixed(2)})`);
    checks.push(['onsets cannot drag a clocked tempo off the desk\'s', drift < 0.5]);
  }
}

/*
  Until the boundary is trusted on recorded sets (PLAN 14z), nobody gets a look
  changed by it without asking: it misses crossfades and gapless sets and can
  fire on a quiet bridge, and a look that changes at the wrong moment is worse
  on a wall than one that holds. This reads the shipped default, not a copy.
*/
checks.push(['a new song keeps the look unless someone asks for more (On a New Song opens on Keep)', DEFAULT_SETTINGS.onNewSong === 'off']);

console.log('');
for (const [what, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${what}`);
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
