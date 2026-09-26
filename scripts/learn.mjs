#!/usr/bin/env node
/**
 * Sound learn: does a control bound to the music do what it was bound to, on
 * time, once, and only while there is music?
 *
 *   npm run learn
 *
 * PLAN §5. A control can be bound to the music the way it is bound to a
 * fader: a *mapping* (a setting follows a source's level, by a depth) or a
 * *trigger* (an action, a preset or a dye, fired on a source's onsets, on the
 * beat clock's predicted beat where there is one). The bindings live in the
 * MIDI map, the mappings are folded by the patch bay, the triggers by
 * `src/lib/soundLearn.ts`. This drives all three with a synthesised song run
 * through the real analyser (`analysePcm`) and the real beat clock, frame by
 * frame at 60 fps, exactly as the render loop does, and asserts the feature:
 *
 *   - a kick trigger fires once per kick, and never on a hat;
 *   - with the clock locked it fires on the predicted beat, ahead of the
 *     heard onset (the lead is printed), and the heard onset is absorbed;
 *   - a backbeat snare is predicted too, and a bar trigger steps every four
 *     beats;
 *   - a mapping at depth d moves its setting by d of its travel at full
 *     source, reads only the source it names, and two on one setting add and
 *     clamp;
 *   - a map with sound bindings saved and loaded is the same map, through the
 *     same file and the same storage key as the controller's bindings;
 *   - with the music stopped nothing fires and nothing moves.
 *
 * The drums are the same recipe as `npm run bands` (a 60→50 Hz kick, a snare
 * of 200 Hz body and high-passed noise, three-pole high-passed hats), at 120
 * bpm, humanised ±8 ms from a seeded generator, so every run hears the same
 * song and the truth is known to the sample.
 */
import { analysePcm } from '../src/lib/audioFeatures.ts';
import { BeatClock } from '../src/lib/beatClock.ts';
import { SoundLearn } from '../src/lib/soundLearn.ts';
import {
  parseMidiMap, serializeMidiMap, saveMidiMap, loadMidiMap, withLoadedMap, MIDI_MAP_KEY, LEARNABLE_SETTINGS,
} from '../src/lib/midi.ts';
import { PatchBay, SETTING_TRAVEL } from '../src/lib/sceneMap.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';

const SR = 44100;
const FPS = 60;
const BPM = 120;
const BEAT = 60 / BPM;
const SECONDS = 16;
/** The Beat Lead the show ships with (`DEFAULT_SETTINGS.beatLead`), so the lead measured is the one a show gets. */
const LEAD_MS = DEFAULT_SETTINGS.beatLead;

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── Synthesis (the recipe in scripts/bands.mjs) ───────────────────────────

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function highPass(x, fc) {
  const rc = 1 / (2 * Math.PI * fc), a = rc / (rc + 1 / SR);
  const y = new Float32Array(x.length);
  let px = 0, py = 0;
  for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; }
  return y;
}
function lowPass(x, fc) {
  const rc = 1 / (2 * Math.PI * fc), a = (1 / SR) / (rc + 1 / SR);
  const y = new Float32Array(x.length);
  let py = 0;
  for (let i = 0; i < x.length; i++) { py += a * (x[i] - py); y[i] = py; }
  return y;
}
const noise = (n, rand) => Float32Array.from({ length: n }, () => rand() * 2 - 1);
const tail = (i, len, sec) => Math.min(1, (len - i) / (sec * SR));
function kick(out, t0, vel) {
  const s0 = Math.round(t0 * SR), len = Math.round(0.4 * SR);
  let phase = 0;
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    const t = i / SR;
    phase += 2 * Math.PI * (50 + 10 * Math.exp(-t / 0.04)) / SR;
    out[s0 + i] += 0.8 * vel * Math.min(1, t / 0.001) * Math.exp(-t / 0.12) * tail(i, len, 0.1) * Math.sin(phase);
  }
}
function snare(out, t0, vel, rand) {
  const s0 = Math.round(t0 * SR), len = Math.round(0.25 * SR);
  const n = lowPass(highPass(highPass(noise(len, rand), 1000), 1000), 8000);
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    const t = i / SR;
    const body = 0.35 * Math.exp(-t / 0.06) * Math.sin(2 * Math.PI * 200 * t);
    out[s0 + i] += vel * Math.min(1, t / 0.001) * tail(i, len, 0.05) * (body + 0.5 * Math.exp(-t / 0.07) * n[i]);
  }
}
function hat(out, t0, vel, rand) {
  const s0 = Math.round(t0 * SR), len = Math.round(0.08 * SR);
  const n = highPass(highPass(highPass(noise(len, rand), 7000), 7000), 7000);
  for (let i = 0; i < len && s0 + i < out.length; i++) {
    const t = i / SR;
    out[s0 + i] += 0.6 * vel * Math.min(1, t / 0.0005) * Math.exp(-t / 0.015) * tail(i, len, 0.02) * n[i];
  }
}
/** -96 dBFS RMS: a 16-bit recording's own floor. */
const DITHER = 1.6e-5;
/** -66 dBFS RMS: a quiet room through a microphone. */
const ROOM = 5e-4;

/**
 * A song and its truth. Kicks on every beat, a snare on the backbeat, hats
 * on every eighth (the ones on the beat under the kick and snare). At
 * `stopAt` seconds the music stops mid-note, tails and all: `after` says what
 * is left, digital silence (a player stopped) or a room's hiss (a band that
 * stopped playing). `truth.end` is the last hit, after which no trigger has
 * anything to fire for.
 */
/**
 * A sustained chord (three detuned sawtooth-ish voices, a second's fade-in):
 * the thing that keeps sounding in a breakdown when the drums drop out, so
 * the music is plainly still playing while no drum is.
 */
function pad(out) {
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const f of [110, 138.6, 164.8]) for (const d of [0.998, 1.002]) for (let h = 1; h <= 4; h++) s += Math.sin(2 * Math.PI * f * d * h * t) / h;
    out[i] += 0.03 * Math.min(1, t) * s;
  }
}

function song({ kicks = true, snares = true, hats = true, stopAt = Infinity, after = 'zeros', withPad = false, drumsStopAt = Infinity, seed = 3, seconds = SECONDS } = {}) {
  const rand = rng(seed);
  const out = new Float32Array(seconds * SR);
  const truth = { kick: [], snare: [], hats: [], offHats: [] };
  for (let b = 1; b * BEAT < seconds - 0.5; b++) {
    for (let e = 0; e < 2; e++) {
      const t = b * BEAT + e * BEAT / 2 + (rand() - 0.5) * 0.016;
      if (t >= stopAt || t >= drumsStopAt) continue;
      if (hats) { hat(out, t, 0.6 + 0.4 * rand(), rand); truth.hats.push(t); if (e === 1) truth.offHats.push(t); }
      if (e === 0 && kicks) { kick(out, t, 0.7 + 0.3 * rand()); truth.kick.push(t); }
      if (e === 0 && snares && b % 2 === 1) { snare(out, t, 0.7 + 0.3 * rand(), rand); truth.snare.push(t); }
    }
  }
  if (withPad) pad(out);
  const stopS = Math.min(out.length, Math.round(stopAt * SR));
  for (let i = 0; i < out.length; i++) {
    const floor = i < stopS ? DITHER : after === 'hiss' ? ROOM : 0;
    out[i] = i < stopS ? out[i] + floor * (rand() * 2 - 1) * Math.sqrt(3) : floor * (rand() * 2 - 1) * Math.sqrt(3);
  }
  truth.end = Math.max(...truth.hats, ...truth.kick, ...truth.snare);
  return { readings: analysePcm(out, SR, FPS), truth };
}

/**
 * The render loop, reduced to what sound learn sees: the analyser's reading,
 * the beat clock stepped on it, and the engine. `clock` false leaves the
 * engine with no beat at all, so every trigger is a heard one.
 *
 * The clock is fed the kick's level, where the live show feeds it the hook's
 * smoothed bass: both rise on the kick and fall between, which is all the
 * clock reads. What the engine takes from it is only its period, its next
 * beat and whether it is locked, which is the same whatever it was fed.
 */
function play(readings, bindings, { clock = true, trust = 1, lead = LEAD_MS, stopped = () => false } = {}) {
  const engine = new SoundLearn();
  const beat = new BeatClock();
  const fires = [];
  let lockedAt = null;
  readings.forEach((r, f) => {
    const now = (f * 1000) / FPS;
    const reading = stopped(now) ? null : r;
    let view = null;
    if (clock) {
      beat.update(now, reading ? reading.kick : 0, trust, lead);
      view = { period: beat.period, nextBeat: beat.nextBeat, locked: beat.isLocked(now, trust), leadMs: lead };
      if (view.locked && lockedAt === null) lockedAt = now;
    }
    for (const x of engine.step(now, reading, view, bindings)) fires.push({ ...x, frame: f });
  });
  return { fires, lockedAt, period: beat.period };
}

const ms = (s) => s * 1000;
const T = (source, target, extra = {}) => ({ id: `${source}->${JSON.stringify(target)}`, source, target, ...extra });
const PRESET_NEXT = { kind: 'action', action: 'preset-next' };
const SEED = { kind: 'action', action: 'seed' };

/**
 * Match fires to hits: each hit claims the first unclaimed fire in
 * [hit − early, hit + late]. Returns how many hits were claimed, the fires
 * nothing claimed, and for each claimed hit how far ahead of it the fire was.
 */
function claim(fires, hits, early, late) {
  const used = new Set();
  const leads = [];
  let found = 0;
  const twice = [];
  for (const h of hits) {
    const t = ms(h);
    const mine = fires.filter((x, i) => !used.has(i) && x.at >= t - early && x.at <= t + late);
    if (mine.length > 1) twice.push(h);
    const i = fires.findIndex((x, j) => !used.has(j) && x.at >= t - early && x.at <= t + late);
    if (i < 0) continue;
    used.add(i);
    found++;
    leads.push({ ahead: t - fires[i].at, predicted: fires[i].predicted });
  }
  return { found, strays: fires.filter((_, i) => !used.has(i)), leads, twice };
}
/**
 * The fires while there was a song to fire for: up to the last hit, and the
 * 40 ms a heard onset of it can take to arrive. What a trigger does after the
 * band stops is its own question, asked under "Stopped" below; asked here, the
 * one beat the clock coasts past the end of the song would read as a fire on
 * nothing in every check that plays the song to its end.
 */
const during = (fires, truth) => fires.filter(x => x.at <= ms(truth.end) + 40);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a');

// ── Triggers ──────────────────────────────────────────────────────────────

const band = song();
const kickOnly = [T('kick', PRESET_NEXT)];

{
  // No clock: every fire is a heard onset, which lands 0–33 ms after the
  // kick at 60 fps (the analyser's first frame that can hear it, or the next).
  const { fires } = play(band.readings, kickOnly, { clock: false });
  const c = claim(fires, band.truth.kick, 0, 40);
  // No clock, so nothing coasts: this one is judged on the whole run,
  // including the second of silence after the last hit.
  check('with no beat clock, a kick trigger fires once per kick', c.found === band.truth.kick.length && c.strays.length === 0 && c.twice.length === 0,
    `${c.found}/${band.truth.kick.length} kicks, ${c.strays.length} fires on nothing, ${c.twice.length} twice; latency ${fmt(-mean(c.leads.map(l => l.ahead)))} ms`);
  const onHat = fires.filter(x => band.truth.offHats.some(h => Math.abs(x.at - ms(h)) < 60));
  check('and never on a hat', onHat.length === 0, `${onHat.length} fires within 60 ms of the ${band.truth.offHats.length} off-beat hats`);
}
{
  const hatsOnly = song({ kicks: false, snares: false });
  const a = play(hatsOnly.readings, kickOnly, { clock: false }).fires.length;
  const b = play(hatsOnly.readings, kickOnly).fires.length;
  check('a kick trigger over hats alone fires nothing', a === 0 && b === 0, `${a} with no clock, ${b} with one, over ${hatsOnly.truth.hats.length} hats`);
}

let kickLead = NaN;
{
  const played = play(band.readings, kickOnly);
  const { lockedAt, period } = played;
  const fires = during(played.fires, band.truth);
  check('the beat clock locks to the song', lockedAt !== null && Math.abs(period - ms(BEAT)) < 15,
    lockedAt === null ? 'never locked' : `locked at ${(lockedAt / 1000).toFixed(2)} s on ${period.toFixed(1)} ms (a beat is ${ms(BEAT)})`);
  // Every kick, before and after the lock, claimed once: a predicted fire may
  // come up to the lead and a frame early, a heard one up to 40 ms late.
  const c = claim(fires, band.truth.kick, LEAD_MS + 40, 40);
  check('with the clock, still once per kick and never on anything else', c.found === band.truth.kick.length && c.strays.length === 0 && c.twice.length === 0,
    `${c.found}/${band.truth.kick.length} kicks, ${c.strays.length} strays, ${c.twice.length} twice`);
  // After the lock: fired on the prediction, ahead of the heard onset.
  const after = band.truth.kick.filter(t => lockedAt !== null && ms(t) > lockedAt + ms(BEAT));
  const locked = claim(fires, after, LEAD_MS + 40, 40);
  const predicted = locked.leads.filter(l => l.predicted);
  // What the show would otherwise have done: fire on the heard onset. The
  // lead against that is the whole point, so it is measured against the
  // analyser's own onset for the same kick, not only against the audio.
  const heard = claim(play(band.readings, kickOnly, { clock: false }).fires, after, 0, 40);
  const heardLate = heard.leads.map(l => -l.ahead);
  const aheadOfAudio = predicted.map(l => l.ahead);
  kickLead = mean(aheadOfAudio) + mean(heardLate);
  check('locked, it fires on the predicted beat, ahead of the heard onset',
    after.length > 10 && predicted.length / after.length >= 0.9 && predicted.every(l => l.ahead > 0),
    `${predicted.length}/${after.length} kicks fired from the clock; ahead of the kick in the audio by ${fmt(mean(aheadOfAudio))} ms `
    + `(min ${fmt(Math.min(...aheadOfAudio))}), ahead of the heard onset by ${fmt(kickLead)} ms; Beat Lead ${LEAD_MS} ms`);
}
{
  const snareOnly = [T('snare', SEED)];
  const played = play(band.readings, snareOnly);
  const { lockedAt } = played;
  const fires = during(played.fires, band.truth);
  const c = claim(fires, band.truth.snare, LEAD_MS + 40, 40);
  const after = band.truth.snare.filter(t => lockedAt !== null && ms(t) > lockedAt + 4 * ms(BEAT));
  const lp = claim(fires, after, LEAD_MS + 40, 40).leads.filter(l => l.predicted);
  check('a backbeat snare fires once per snare, predicted once the clock has it',
    c.found === band.truth.snare.length && c.strays.length === 0 && c.twice.length === 0 && lp.length / Math.max(1, after.length) >= 0.9,
    `${c.found}/${band.truth.snare.length} snares, ${c.strays.length} strays; ${lp.length}/${after.length} predicted, ahead by ${fmt(mean(lp.map(l => l.ahead)))} ms`);
}
{
  const bars = [T('bar', PRESET_NEXT)];
  const beats = [T('beat', SEED)];
  const played = play(band.readings, [...bars, ...beats]);
  const { lockedAt } = played;
  const fires = during(played.fires, band.truth);
  const barFires = fires.filter(x => x.binding.source === 'bar');
  const beatFires = fires.filter(x => x.binding.source === 'beat');
  const gaps = barFires.slice(1).map((x, i) => x.at - barFires[i].at);
  const expectBars = beatFires.length / 4;
  check('a bar trigger steps once every four beats, on the beat',
    barFires.length >= 5 && Math.abs(barFires.length - expectBars) <= 1 && gaps.every(g => Math.abs(g - 4 * ms(BEAT)) < 40)
      && barFires.every(x => x.predicted && beatFires.some(b => b.at === x.at)),
    `${barFires.length} bars over ${beatFires.length} beats from ${lockedAt === null ? '—' : (lockedAt / 1000).toFixed(2)} s; gaps ${fmt(Math.min(...gaps))}–${fmt(Math.max(...gaps))} ms`);
}

// ── Stopped ───────────────────────────────────────────────────────────────

const every = [T('kick', PRESET_NEXT), T('snare', SEED), T('hats', { kind: 'dye', paletteIndex: 2 }), T('level', SEED), T('band1', SEED), T('beat', SEED), T('bar', PRESET_NEXT)];
{
  const silent = song({ stopAt: 0 });
  const a = play(silent.readings, every).fires.length;
  const b = play(band.readings, every, { stopped: () => true }).fires.length;
  check('with the music stopped nothing fires', a === 0 && b === 0,
    `${a} over ${SECONDS} s of a stopped player, ${b} with no reading at all (${every.length} triggers, clock on)`);
}
/*
  The music stopping under a locked clock.

  A trigger fired from the clock is a promise made before the sound: it fires
  on a beat the source has been landing on, a Beat Lead before the beat. When
  the music stops dead, the beat after the last hit has already been promised
  by the time there is silence to hear, so it fires once — the same beat the
  show's own kick reactions coast through. What must not happen is anything
  after that: no second coasting beat, no bar, no heard onset out of the
  silence or out of a room's hiss. So: at most one fire per trigger in the
  beat after the stop, and none at all after it.
*/
for (const after of ['zeros', 'hiss']) {
  const stopAt = 10.2;
  const s = song({ stopAt, after });
  const { fires } = play(s.readings, every);
  const before = fires.filter(x => x.at <= ms(s.truth.end) + 40).length;
  const coast = fires.filter(x => x.at > ms(s.truth.end) + 40 && x.at <= ms(s.truth.end) + ms(BEAT) + 40);
  const late = fires.filter(x => x.at > ms(s.truth.end) + ms(BEAT) + 40);
  const perTrigger = Math.max(0, ...every.map(b => coast.filter(x => x.binding === b).length));
  check(`${after === 'zeros' ? 'a player stopped mid-bar' : 'a band that stops dead, over room hiss'}: nothing fires a beat after it stops`,
    before > 20 && late.length === 0 && perTrigger <= 1 && coast.every(x => x.predicted),
    `${before} fires while it played; in the beat after, ${coast.length} (${coast.map(x => x.binding.source).join(', ') || 'none'}), all from the clock; after that ${late.length}`
      + `${late.length ? `: ${late.slice(0, 4).map(x => `${x.binding.source}@${(x.at / 1000).toFixed(2)}`).join(', ')}` : ''}`);
}

{
  /*
    The drums drop out and the pad plays on: the music is still sounding, so
    the level gate lets predictions through, and only each source's own
    pattern can stop it being promised a hit that is no longer coming. So each
    drum trigger may fire at most once after its own last hit, from the clock
    (a promise made before the silence), and never from the sound.

    "After its own last hit" and not "in the beat after the last hit": a
    source on every other beat keeps its promise two beats on, not one. The
    hats here are that case without looking like it. They are on every eighth,
    but the ones under the snare read as the snare (the analyser's known limit,
    `npm run bands`), so on the beat they are heard on one and three only and
    their one promise comes two beats after their last hit.

    (The clock's own beat and bar coast on until the clock lets go, which is
    what a beat does in a breakdown; they are not judged here.)
  */
  const s = song({ withPad: true, drumsStopAt: 10.2 });
  const drums = every.filter(b => ['kick', 'snare', 'hats'].includes(b.source));
  const { fires } = play(s.readings, drums);
  const after = drums.map(b => {
    const last = Math.max(...s.truth[b.source]);
    return { b, fires: fires.filter(x => x.binding === b && x.at > ms(last) + 40) };
  });
  check('the drums drop out under a pad: each drum trigger fires at most once after its last hit, from the clock',
    after.every(a => a.fires.length <= 1 && a.fires.every(x => x.predicted)),
    after.map(a => `${a.b.source} ${a.fires.length}${a.fires.length ? ` (${a.fires.map(x => `${(x.at / 1000).toFixed(2)} s`).join(', ')})` : ''}`).join(', '));
}

// ── Mappings ──────────────────────────────────────────────────────────────

/** A reading with every source at 0 but the ones named. */
const quiet = band.readings[0];
const readingWith = (over) => {
  const r = { ...quiet, level: 0, kick: 0, bass: 0, snare: 0, hats: 0, bands: quiet.bands.map(() => 0), ...over };
  return r;
};
const learn = new SoundLearn();
const foldWith = (bindings, reading, { base = 0.2, soundImpact = 1, own = [] } = {}) => {
  const settings = { ...DEFAULT_SETTINGS, turbulenceScale: base, layerCount: 1, sceneMappings: own };
  const bay = new PatchBay(settings);
  bay.fold(settings, { room: null, film: null, sound: reading ? { features: reading } : null, shape: null, roomImpact: 1, filmImpact: 1, soundImpact, shapeImpact: 1 },
    1, 1000, learn.patchesOf(bindings));
  return bay.global.turbulenceScale;
};
const M = (source, depth, key = 'turbulenceScale') => {
  const s = LEARNABLE_SETTINGS.find(x => x.key === key);
  return T(source, { kind: 'setting', key, min: s.min, max: s.max }, { depth });
};
{
  const travel = SETTING_TRAVEL.turbulenceScale;
  const span = travel.max - travel.min;
  const cases = [0.5, 0.25, -0.15].map(d => ({ d, got: foldWith([M('kick', d)], readingWith({ kick: 1 })) - 0.2 }));
  check('a mapping at depth d moves its setting by d of its travel at full source',
    cases.every(c => Math.abs(c.got - c.d * span) < 1e-9), cases.map(c => `d ${c.d}: ${c.got.toFixed(3)}`).join(', '));
  const half = foldWith([M('kick', 0.5)], readingWith({ kick: 0.5 })) - 0.2;
  check('and by half that at half source', Math.abs(half - 0.25 * span) < 1e-9, half.toFixed(3));
  const band4 = foldWith([M('band4', 0.4)], readingWith({ bands: quiet.bands.map((_, i) => (i === 3 ? 1 : 0)) })) - 0.2;
  check('a band maps the same way', Math.abs(band4 - 0.4 * span) < 1e-9, band4.toFixed(3));
  const other = foldWith([M('kick', 0.5)], readingWith({ snare: 1, hats: 1, bands: quiet.bands.map(() => 1) }));
  check('a mapping reads only the source it names', other === 0.2, `kick silent, everything else full: ${other}`);
  const sum = foldWith([M('kick', 0.3), M('snare', 0.2)], readingWith({ kick: 1, snare: 1 }));
  const clamped = foldWith([M('kick', 0.6), M('snare', 0.5)], readingWith({ kick: 1, snare: 1 }));
  const floor = foldWith([M('kick', -0.6), M('snare', -0.5)], readingWith({ kick: 1, snare: 1 }));
  check('two mappings on one setting add, and clamp to its travel',
    Math.abs(sum - 0.7) < 1e-9 && clamped === travel.max && floor === travel.min, `0.2 + 0.3 + 0.2 = ${sum.toFixed(3)}; 0.2 + 0.6 + 0.5 → ${clamped}; 0.2 − 0.6 − 0.5 → ${floor}`);
  const withLook = foldWith([M('kick', 0.3)], readingWith({ kick: 1, snare: 1 }),
    { own: [{ source: 'bands', feature: 'snare', setting: 'turbulenceScale', depth: 0.2, layer: 'all' }] });
  check("and a learned mapping adds to a look's own patch on the same setting", Math.abs(withLook - 0.7) < 1e-9, withLook.toFixed(3));
  const master = foldWith([M('kick', 0.5)], readingWith({ kick: 1 }), { soundImpact: 0 });
  check('Sound Impact pulls learned mappings down with every other sound patch', master === 0.2, String(master));
}
{
  // The music stopped: no reading (no input, the cast display) and a reading
  // of a stopped player both leave the setting where the look put it.
  const zeros = song({ stopAt: 0 }).readings;
  const moved = zeros.map(r => foldWith([M('kick', 0.5), M('level', 0.5), M('band1', -0.5)], r)).filter(v => v !== 0.2);
  const none = foldWith([M('kick', 0.5)], null);
  check('with the music stopped a mapping moves nothing', moved.length === 0 && none === 0.2,
    `${moved.length} of ${zeros.length} frames of a stopped player moved it; with no reading ${none}`);
  // And over the song, the setting follows the kick exactly: one number per
  // frame, no smoothing, no prediction.
  const follows = band.readings.every(r => Math.abs(foldWith([M('kick', 0.5)], r) - Math.min(1, 0.2 + 0.5 * r.kick)) < 1e-9);
  check('over a song, a mapping follows its source frame by frame', follows);
}

// ── The file ──────────────────────────────────────────────────────────────
{
  const map = {
    format: 'chromaglass-midi', version: 1, name: 'Rig', device: 'APC40 mkII',
    bindings: [{ id: 'b-1', source: { kind: 'cc', channel: 0, number: 7 }, target: { kind: 'setting', key: 'dimmer', min: 0, max: 1 }, mode: 'absolute' }],
    sound: [
      M('kick', 0.35),
      M('band3', -0.2, 'saturationBoost'),
      T('snare', SEED),
      T('bar', PRESET_NEXT),
      T('hats', { kind: 'dye', paletteIndex: 3 }),
      T('kick', { kind: 'preset', presetId: 'classic' }),
    ],
  };
  const back = parseMidiMap(serializeMidiMap(map));
  check('a map with sound bindings saved and loaded is the same map', JSON.stringify(back) === JSON.stringify(map),
    `${back.bindings.length} controller binding, ${back.sound?.length} sound bindings`);

  // The same storage the controller's map uses: one key, one file.
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  saveMidiMap(map);
  const kept = loadMidiMap();
  check('through the same storage key as the controller bindings', store.size === 1 && store.has(MIDI_MAP_KEY) && JSON.stringify(kept) === JSON.stringify(map),
    `${[...store.keys()].join(', ')}`);

  const old = parseMidiMap(JSON.stringify({ format: 'chromaglass-midi', version: 1, name: 'Old', bindings: map.bindings }));
  const merged = withLoadedMap(map, old);
  const cleared = withLoadedMap(map, parseMidiMap(JSON.stringify({ ...map, sound: [] })));
  check('a controller file with nothing about the music leaves the music alone',
    old.sound === undefined && merged.sound === map.sound && merged.name === 'Old' && cleared.sound.length === 0);

  const bad = parseMidiMap(JSON.stringify({ ...map, sound: [
    { id: 'x1', source: 'cowbell', target: SEED },
    { id: 'x2', source: 'kick', target: { kind: 'action', action: 'record-toggle' } },
    { id: 'x3', source: 'kick', target: { kind: 'action', action: 'self-destruct' } },
    { id: 'x4', source: 'beat', target: { kind: 'setting', key: 'dimmer', min: 0, max: 1 }, depth: 0.5 },
    { id: 'x5', source: 'kick', target: { kind: 'setting', key: 'notASetting', min: 0, max: 1 }, depth: 0.5 },
    { id: 'x6', source: 'kick', target: { kind: 'setting', key: 'dimmer', min: 0.3, max: 0.4 }, depth: 7 },
    null,
  ] }));
  check('a hand-edited file keeps only what the show can act on',
    bad.sound.length === 1 && bad.sound[0].id === 'x6' && bad.sound[0].depth === 1 && bad.sound[0].target.max === 1,
    `kept ${bad.sound.map(b => `${b.id} depth ${b.depth} travel ${b.target.min}..${b.target.max}`).join(', ')}`);
}

console.log(`\n${passed}/${passed + failed} sound learn checks passed${Number.isFinite(kickLead) ? `; a locked kick fires ${kickLead.toFixed(0)} ms ahead of its heard onset` : ''}`);
process.exit(failed ? 1 : 0);
