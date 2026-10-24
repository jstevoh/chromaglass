#!/usr/bin/env node
/**
 * Does the show catch where one real song ends and the next begins?
 *
 *   npm run songends                       the eight songs in scripts/fixtures/songs
 *   npm run songends -- --dir <folder>     any folder of audio files (the lab corpus)
 *
 * PLAN.md 14z. The owner, 2026-10-24: song detection "doesn't detect the
 * beginning and end of songs and appropriately transition". The check it had
 * (`npm run music`) fed the gap rule level traces made up for it, and made-up
 * traces have none of what went wrong: no song ending in its own decay, no
 * last chord after a stop, no soft intro, no room noise, no crossfade that
 * sounds like music the whole way through. So this joins recordings of real
 * songs the ways players join them and runs the app's own ear over the result:
 * the analyser's arithmetic (`AnalyserEmulator`, `AudioFeatures`, the same
 * code the live ear runs) on the joined samples, at the app's 48 kHz and 60
 * readings a second, into `SongBoundary`, the class the app feeds.
 *
 * The joins, between each song and the next in a ring:
 *
 *   gap05, gap2   half a second and two seconds of room between the files
 *                 (a streaming service's pause; a CD's)
 *   gapless       the files back to back, as a gapless player plays them
 *   gap2r,        the same in a noisy room: the room's noise 18 dB louder,
 *   gaplessr      about 30 dB under the music, as a microphone hears it
 *   gap2rise      a two-second gap after the room has filled up: quiet when
 *                 the song began, noisy from five seconds in (the last 100 s
 *                 of that song, not 40: see JOINS)
 *   xfade6,       a DJ's or a player's equal-power crossfade, 6 and 16 s
 *   xfade16
 *
 * each the last 40 s of one song into the first 30 of the next. And every song
 * whole, from room tone to room tone, in the quiet room and the noisy one,
 * where a change anywhere is a false one.
 And eight seconds from the middle of each song, two of room, then the next
 * song: a sound too short to be a song, so nothing ended, and a change there
 * is false too.
 *
 * What counts. For a join with a gap or none, the boundary's own `startedAt`
 * (where it says the new song began) must fall within a second of the new
 * file's first sample, and the change must land within three; anything else
 * after the first song's start is false. A crossfade's change may come from
 * the new song's first audible moment to three seconds after the fade.
 *
 * Crossfades are never quiet, and measured on the lab's twenty-three songs no
 * summary of the sound separated two songs from two sections of one, so the
 * boundary is not asked to hear them. Song identification is: the local
 * matcher (`localFingerprint.ts`, what names a song the show has heard
 * before) over the same joins, every song fingerprinted first from a copy in
 * a noisy room (the app's library is its own room recordings), with a
 * four-second capture every six seconds as `useMusicIntelligence` takes it.
 * Each join's boundary changes and names then go through `SongChangeGate`,
 * as the hook sends them, so a gap and the name that follows it count once.
 * Not modelled: the app's capture resampling, its sound-present gate, the
 * busy flag shared with the API, and the forced match after a long gap.
 *
 * The rule the boundary replaced runs beside it, for the numbers before: the
 * old class verbatim (1.8 s of quiet after 20 s of song) timed against the
 * room tracker's verdict, `RoomTracker` fed the loudest bin as the app feeds
 * it. Read at 60 a second here; the app read it on its renders, ten a second.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { AnalyserEmulator, AudioFeatures } from '../src/lib/audioFeatures.ts';
import { RoomTracker } from '../src/lib/audioCalibration.ts';
import { SongBoundary, SongChangeGate } from '../src/lib/songBoundary.ts';
import { extractPeakHashes, buildIndex, matchSnippet, FP_RATE } from '../src/lib/localFingerprint.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SR = 48000;
const FPS = 60;
const LEAD = 3;          // seconds of room before the first note
const TAIL_A = 40;       // the end of the song before the join
const HEAD_B = 30;       // the start of the song after it
const SHORT_SEC = 8;     // a sound too short to be a song (SongBoundary's MIN_SONG_SEC is 20)
const QUIET_ROOM_DB = -66, NOISY_ROOM_DB = -48;
const JOINS = {
  gap05: { gap: 0.5 }, gap2: { gap: 2 }, gapless: { gap: 0 },
  gap2r: { gap: 2, noisy: true }, gaplessr: { gap: 0, noisy: true },
  // A longer end of the song before it: the room fills up five seconds into
  // the case and the gap comes 95 s later. The floor looks back a minute for
  // its quietest second and then climbs at a decibel a second (`SongBoundary`),
  // so it has followed a room 18 dB louder about 80 s after the room got
  // there; with the forty seconds the other joins have, the room rose 35 s
  // before the gap and was caught 1 time in 8. A room that fills up in the
  // last minute and a half of a song is a limit, written in PLAN 14z-6.
  gap2rise: { gap: 2, rise: true, tail: 100 },
  xfade6: { xfade: 6 }, xfade16: { xfade: 16 },
};
const ID_EVERY = 6;      // useMusicIntelligence's LOCAL_MATCH_INTERVAL_MS, in seconds

const decode = (file, rate) => {
  const run = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (run.error || run.status !== 0 || run.stdout.byteLength < rate * 4) return null;
  return new Float32Array(Uint8Array.from(run.stdout).buffer);
};

/** A seeded generator, so the room's noise is the same every run. */
function prng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
}

/** White noise at `db` dBFS RMS under `out[from..]`: the room, and the microphone's preamp. */
function addRoom(out, db, rnd, from = 0) {
  const a = 10 ** (db / 20) * Math.sqrt(3);
  for (let i = from; i < out.length; i++) out[i] += (rnd() * 2 - 1) * a;
}

/** One case's samples at `rate`, and where its new song begins (s). */
function build(spec, pcm, rate) {
  const S = (s) => Math.round(s * rate);
  const rnd = prng(spec.seed);
  if (spec.kind === 'short') {
    // Eight seconds from the middle of one song (a sound check, a phone's
    // ringtone, someone trying the speakers), two of room, then the next song.
    const a = pcm[spec.a].subarray(S(60), S(60 + SHORT_SEC)), b = pcm[spec.b].subarray(0, S(HEAD_B));
    const out = new Float32Array(S(LEAD) + a.length + S(2) + b.length);
    out.set(a, S(LEAD));
    out.set(b, S(LEAD) + a.length + S(2));
    addRoom(out, QUIET_ROOM_DB, rnd);
    return { samples: out, boundary: (S(LEAD) + a.length + S(2)) / rate };
  }
  if (spec.kind === 'whole') {
    const a = pcm[spec.a];
    const out = new Float32Array(S(LEAD) + a.length + S(LEAD));
    out.set(a, S(LEAD));
    addRoom(out, spec.noisy ? NOISY_ROOM_DB : QUIET_ROOM_DB, rnd);
    return { samples: out, boundary: null };
  }
  const j = JOINS[spec.join];
  const A = pcm[spec.a], B = pcm[spec.b];
  const tail = A.subarray(Math.max(0, A.length - S(j.tail ?? TAIL_A))), head = B.subarray(0, S(HEAD_B));
  let out, boundary;
  if (j.xfade) {
    const n = S(j.xfade);
    out = new Float32Array(S(LEAD) + tail.length - n + head.length);
    out.set(tail.subarray(0, tail.length - n), S(LEAD));
    const at = S(LEAD) + tail.length - n;
    for (let k = 0; k < n; k++) {
      const x = (k / n) * Math.PI / 2;
      out[at + k] = tail[tail.length - n + k] * Math.cos(x) + head[k] * Math.sin(x);
    }
    out.set(head.subarray(n), at + n);
    boundary = at / rate;
  } else {
    out = new Float32Array(S(LEAD) + tail.length + S(j.gap) + head.length);
    out.set(tail, S(LEAD));
    out.set(head, S(LEAD) + tail.length + S(j.gap));
    boundary = (S(LEAD) + tail.length + S(j.gap)) / rate;
  }
  addRoom(out, j.noisy ? NOISY_ROOM_DB : QUIET_ROOM_DB, rnd);
  // The room filling up: the quiet room's noise, then the noisy room's on top.
  if (j.rise) addRoom(out, NOISY_ROOM_DB, rnd, S(LEAD + 5));
  return { samples: out, boundary };
}

/** The old rule, verbatim from before PLAN 14z, for the numbers before. */
class OldBoundary {
  playingSince = null; quietSince = null; armed = false; ended = false;
  update(quiet, now) {
    if (quiet) {
      if (this.quietSince === null) this.quietSince = now;
      if (this.armed && now - this.quietSince >= 1800) { this.ended = true; this.armed = false; }
      return false;
    }
    this.quietSince = null;
    let fired = false;
    if (this.ended) { this.ended = false; this.playingSince = now; fired = true; }
    else if (this.playingSince === null) this.playingSince = now;
    if (!this.armed && this.playingSince !== null && now - this.playingSince >= 20000) this.armed = true;
    return fired;
  }
}

/** The app's ear over one case: when the new boundary fires, and when the old rule did. */
function listen(samples) {
  const analyser = new AnalyserEmulator(SR);
  const features = new AudioFeatures();
  // Two trackers for the old rule. The app's starts on whatever the analyser
  // hands it first, and an analyser with nothing through it yet hands it
  // digital silence, parked at -140: the tracker's floor seeds there and then
  // climbs about a tenth of a decibel a second, so every room is "sound" for
  // minutes and the rule never sees a gap (14z-5). The second is fair to the
  // rule, seeded from the first frame with sound in it, and gives the numbers
  // before.
  const room = new RoomTracker(), roomSilent = new RoomTracker();
  const boundary = new SongBoundary(), old = new OldBoundary(), oldSilent = new OldBoundary();
  const fires = [], oldFires = [], oldSilentFires = [];
  let lastOld = -Infinity, lastOldSilent = -Infinity, roomSeeded = false;
  const frames = Math.ceil((samples.length * FPS) / SR);
  for (let i = 0; i < frames; i++) {
    const t = i / FPS;
    const { bins, timeDomainData } = analyser.frame(samples, Math.round((i * SR) / FPS), 1 / FPS);
    const r = features.update({ bins, timeDomainData, scale: 'db', sampleRate: SR, fftSize: analyser.fftSize }, t);
    const start = boundary.update({ time: t, levelDb: r.db[0], hit: r.onsets.kick.hit || r.onsets.level.hit });
    if (start) fires.push({ at: start.at, startedAt: start.startedAt, onBeat: start.onBeat });
    let peak = -Infinity;
    for (let k = 0; k < bins.length; k++) if (bins[k] > peak) peak = bins[k];
    // useSongChange's own ten-second hold on the old side too.
    const calSilent = roomSilent.update(peak, 1 / FPS);
    if (oldSilent.update(!calSilent.sound, t * 1000) && t - lastOldSilent >= 10) { lastOldSilent = t; oldSilentFires.push({ at: t, startedAt: t }); }
    if (peak > -130 || roomSeeded) {
      roomSeeded = true;
      const cal = room.update(peak, 1 / FPS);
      if (old.update(!cal.sound, t * 1000) && t - lastOld >= 10) { lastOld = t; oldFires.push({ at: t, startedAt: t }); }
    }
  }
  return { fires, oldFires, oldSilentFires };
}

/**
 * The local matcher over one case, a capture every `every` s from a phase
 * spread across the cases: when it names a different song than it last did,
 * and which. The time is the capture's end, plus `LEAD`'s place in the case.
 */
function names(spec, pcm, index, every) {
  const { samples } = build(spec, pcm, FP_RATE);
  const S = (s) => Math.round(s * FP_RATE);
  const out = [];
  let current = null;
  for (let t = 4 + ((spec.seed * 2.7) % every); t + 4 <= samples.length / FP_RATE; t += every) {
    const hit = matchSnippet(samples.subarray(S(t), S(t + 4)), FP_RATE, index);
    if (!hit) continue;
    if (current !== null && hit.isrc !== current) out.push({ at: t + 4, isrc: hit.isrc });
    current = hit.isrc;
  }
  return out;
}

if (!isMainThread) {
  const { files, specs } = workerData;
  const pcm = files.map((f) => decode(f, SR));
  for (const spec of specs) {
    const { samples, boundary } = build(spec, pcm, SR);
    parentPort.postMessage({ spec, boundary, seconds: samples.length / SR, ...listen(samples) });
  }
} else {
  await main();
}

async function main() {
  const dirArg = process.argv.indexOf('--dir');
  const dir = dirArg > 0 ? process.argv[dirArg + 1] : `${ROOT}scripts/fixtures/songs`;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(opus|mp3|ogg|wav|flac|m4a)$/i.test(f)).sort().map((f) => `${dir}/${f}`) : [];
  const probe = files.length ? decode(files[0], 8000) : null;
  if (!files.length || !probe) {
    // CI's Measure job installs ffmpeg for `bands` and `shape`; a laptop
    // without it is told, and this fails rather than passing on nothing.
    console.log(`FAIL  no songs decoded from ${dir} (${files.length} files; is ffmpeg on the path?)`);
    process.exit(1);
  }
  const n = files.length;
  console.log(`${n} songs from ${dir.replace(ROOT, '')}, the app's ear at ${SR / 1000} kHz and ${FPS} readings a second\n`);

  const specs = [];
  let seed = 1;
  for (const noisy of [false, true]) for (let a = 0; a < n; a++) specs.push({ kind: 'whole', a, noisy, seed: seed++ });
  for (const join of Object.keys(JOINS)) for (let a = 0; a < n; a++) specs.push({ kind: 'join', join, a, b: (a + 1) % n, seed: seed++ });
  for (let a = 0; a < n; a++) specs.push({ kind: 'short', a, b: (a + 1) % n, seed: seed++ });

  // Spread over the machine's cores: the ear's arithmetic over two hours of
  // audio is several minutes on one.
  const workers = Math.max(1, Math.min(4, cpus().length));
  const results = [];
  const listening = Promise.all(Array.from({ length: workers }, (_, w) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { files, specs: specs.filter((_, i) => i % workers === w) } });
    worker.on('message', (m) => results.push(m));
    worker.on('error', reject);
    worker.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${w} exited ${code}`))));
  })));

  // Meanwhile, on this thread, song identification over the same cases.
  const name = (i) => files[i].split('/').pop().replace(/\.[^.]+$/, '');
  const fp = files.map((f) => decode(f, FP_RATE));
  const roomCopy = (p, i) => { const c = Float32Array.from(p); addRoom(c, NOISY_ROOM_DB, prng(9000 + i)); return c; };
  const record = (p, i) => { const { hashes, frames, durationSec } = extractPeakHashes(roomCopy(p, i), FP_RATE); return { isrc: name(i), hashes, frames, durationSec, createdAt: 0 }; };
  const records = fp.map(record);
  const index = buildIndex(records);
  const named = new Map();
  for (const spec of specs) named.set(spec.seed, names(spec, fp, index, ID_EVERY));
  // Every twelve, as it was, on the 6 s crossfades: a sanity line, since a
  // capture half as often is late by about half the cadence more.
  const xf6 = specs.filter((s) => s.join === 'xfade6');
  const named12 = new Map(xf6.map((s) => [s.seed, names(s, fp, index, 12)]));
  // The new song missing from the library: a song the show has never heard.
  // Every join, not only the crossfades: one stranger in a few dozen captures
  // is what a matcher that counts a held chord over and over gives, and the
  // crossfades alone caught that by two names (38 over the whole songs).
  const joinSpecs = specs.filter((s) => s.kind === 'join');
  const without = new Map();
  const strangers = joinSpecs.map((s) => {
    if (!without.has(s.b)) without.set(s.b, buildIndex(records.filter((_, i) => i !== s.b)));
    return names(s, fp, without.get(s.b), ID_EVERY);
  });
  await listening;

  const checks = [];
  const check = (what, ok, detail) => { checks.push(ok); console.log(`${ok ? ' ok ' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`); };
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

  /*
    A change counts for a join with a gap (or none) when the boundary says the
    new song began within a second of its first sample and lands within three;
    for a crossfade, from its first audible moment to three seconds after the
    fade. Anything else after the first song's own start is false.
  */
  const inWindow = (r, f) => {
    const j = JOINS[r.spec.join];
    if (j.xfade) return f.at >= r.boundary && f.at <= r.boundary + j.xfade + 3;
    return f.startedAt >= r.boundary - 0.2 && f.startedAt <= r.boundary + 1 && f.at <= r.boundary + 3;
  };
  const score = (key) => {
    const out = { whole: { false: 0, seconds: 0, where: [] }, wholer: { false: 0, seconds: 0, where: [] } };
    for (const r of results) {
      const fires = r[key].filter((f) => f.at > LEAD + 5);
      if (r.spec.kind === 'short') {
        out.short ??= { false: 0, where: [] };
        out.short.false += fires.length;
        for (const f of fires) out.short.where.push(`${name(r.spec.a)} (${SHORT_SEC} s) → ${name(r.spec.b)} at ${(f.at - r.boundary).toFixed(1)} s`);
        continue;
      }
      if (r.spec.kind === 'whole') {
        const o = out[r.spec.noisy ? 'wholer' : 'whole'];
        o.false += fires.length; o.seconds += r.seconds - LEAD - 5;
        for (const f of fires) o.where.push(`${name(r.spec.a)} at ${f.at.toFixed(1)} s`);
        continue;
      }
      const hit = fires.find((f) => inWindow(r, f));
      const o = (out[r.spec.join] ??= { n: 0, hits: 0, late: [], onBeat: 0, false: 0, missed: [], where: [] });
      o.n++;
      for (const f of fires) if (f !== hit) { o.false++; o.where.push(`${name(r.spec.a)} → ${name(r.spec.b)} at ${(f.at - r.boundary).toFixed(1)} s`); }
      if (hit) { o.hits++; o.late.push(hit.at - r.boundary); if (hit.onBeat) o.onBeat++; }
      else o.missed.push(`${name(r.spec.a)} → ${name(r.spec.b)}`);
    }
    return out;
  };
  const now = score('fires'), before = score('oldFires'), silent = score('oldSilentFires');
  console.log('join        before (the old rule)          now');
  for (const join of Object.keys(JOINS)) {
    const b = before[join], a = now[join];
    const fmt = (o) => `${o.hits}/${o.n}${o.hits ? `, median ${med(o.late).toFixed(1)} s` : ''}${o.false ? `, ${o.false} false` : ''}`;
    console.log(`${join.padEnd(11)} ${fmt(b).padEnd(30)} ${fmt(a)}${a.hits ? `, ${a.onBeat} on a hit` : ''}${a.missed.length ? `   missed: ${a.missed.join('; ')}` : ''}${a.where.length ? `   false: ${a.where.join('; ')}` : ''}`);
  }
  console.log(`(the old rule with its room tracker seeded on digital silence, as the app's can be: ${Object.keys(JOINS).map((j) => `${j} ${silent[j].hits}/${silent[j].n}`).join(', ')})`);
  const hours = (now.whole.seconds + now.wholer.seconds) / 3600;
  const wholeFalse = now.whole.false + now.wholer.false;
  console.log(`whole songs ${`${before.whole.false + before.wholer.false} false in ${hours.toFixed(2)} h`.padEnd(30)} ${wholeFalse} false${[...now.whole.where, ...now.wholer.where.map((w) => `${w} (noisy)`)].map((w) => `: ${w}`).join('')}\n`);

  const sum = (joins, f) => joins.reduce((s, j) => s + f(now[j]), 0);
  const gaps = ['gap05', 'gap2', 'gap2r', 'gap2rise'], gapless = ['gapless', 'gaplessr'];
  check('no song changes the look in the middle of itself, in a quiet room or a noisy one', wholeFalse === 0,
    `${now.whole.false} quiet, ${now.wholer.false} noisy, in ${hours.toFixed(2)} h of whole songs`);
  /*
    A sound shorter than a song, then a gap, then music: nothing ended, so
    nothing changes. Against a boundary that let any sound end in a gap
    (MIN_SONG_SEC at 5) every one of these fires where the music begins.
  */
  check(`a sound of ${SHORT_SEC} s, a gap and then a song is not a song ending`, now.short.false === 0,
    `${now.short.false} changes${now.short.where.length ? `: ${now.short.where.join('; ')}` : ''}`);
  check('and no join is heard anywhere but where its new song begins', sum(Object.keys(JOINS), (o) => o.false) === 0, `${sum(Object.keys(JOINS), (o) => o.false)} elsewhere`);
  /*
    Nine in ten, not all. The one gap the boundary misses here is a song that
    stops dead at full level into a soft start half a second later (Thatched
    Villagers into Space Fighter Loop): no decay, and the gap too short for
    the room's floor to count. On the lab's twenty-three songs (the same
    joins, whole files, 70 s tails) it was 65 of 66, that join the miss, and
    no false change in 5.8 hours.
  */
  check('nine gaps in ten between two songs (half a second or two, quiet room, noisy, or a room that filled up 95 s before the gap) are heard where the new song begins',
    sum(gaps, (o) => o.hits) >= 0.9 * sum(gaps, (o) => o.n), gaps.map((j) => `${j} ${now[j].hits}/${now[j].n}`).join(', '));
  check('the change lands within two seconds of the new song\'s first note at the median, on one of its hits at least three times in four',
    med(gaps.flatMap((j) => now[j].late)) <= 2 && sum(gaps, (o) => o.onBeat) >= 0.75 * sum(gaps, (o) => o.hits),
    `median ${med(gaps.flatMap((j) => now[j].late)).toFixed(1)} s, ${sum(gaps, (o) => o.onBeat)} of ${sum(gaps, (o) => o.hits)} on a hit`);
  /*
    A gapless join is caught by the song's own decay into the next, which
    most files have and some do not (a song cut dead, a piano starting under
    the room's noise): 39 of 44 on the lab's songs. The rest are song
    identification's, below.
  */
  check('a gapless join is heard by its fall into the next song at least three times in five',
    sum(gapless, (o) => o.hits) >= 0.6 * sum(gapless, (o) => o.n), `${sum(gapless, (o) => o.hits)}/${sum(gapless, (o) => o.n)}`);
  check('and no fewer of anything than the old rule caught',
    [...gaps, ...gapless].every((j) => now[j].hits >= before[j].hits), [...gaps, ...gapless].map((j) => `${j} ${now[j].hits} vs ${before[j].hits}`).join(', '));

  // ── Song identification, and both ways in through the hook's gate ───────
  const byJoin = {};
  let wrongWhole = 0, twice = 0, never = 0;
  const wrongWhere = [];
  for (const r of results) {
    const got = named.get(r.spec.seed).map((x) => ({ ...x, at: x.at + 0 }));
    if (r.spec.kind === 'short') continue;
    if (r.spec.kind === 'whole') { wrongWhole += got.length; for (const x of got) wrongWhere.push(`${name(r.spec.a)}${r.spec.noisy ? ' (noisy)' : ''} named ${x.isrc} at ${x.at.toFixed(0)} s`); continue; }
    const o = (byJoin[r.spec.join] ??= { n: 0, hits: 0, late: [], wrong: 0, changes: [] });
    o.n++;
    // The build at the matcher's rate puts the join where the ear's does.
    const right = got.find((x) => x.isrc === name(r.spec.b) && x.at > r.boundary);
    o.wrong += got.filter((x) => x !== right).length;
    if (right) { o.hits++; o.late.push(right.at - r.boundary); }
    // Both ways in, in time order, through the gate.
    const gate = new SongChangeGate();
    const events = [...r.fires.filter((f) => f.at > LEAD + 5).map((f) => ({ at: f.at, gap: true })), ...(right ? [{ at: right.at, gap: false }] : [])].sort((x, y) => x.at - y.at);
    const changes = events.filter((e) => (e.gap ? gate.gap(e.at) : gate.track(e.at)));
    if (changes.length > 1) twice++;
    if (changes.length === 0) never++;
  }
  console.log('song identification (the local matcher), every song heard before, a capture every six seconds:');
  for (const [j, o] of Object.entries(byJoin)) console.log(`  ${j.padEnd(9)} named the new song ${o.hits}/${o.n}${o.hits ? `, median ${med(o.late).toFixed(1)} s after it began` : ''}, ${o.wrong} wrong`);
  const late12 = xf6.map((s, k) => { const r = results.find((x) => x.spec.seed === s.seed); const x = named12.get(s.seed).find((y) => y.isrc === name(s.b) && y.at > r.boundary); return x ? x.at - r.boundary : null; }).filter((x) => x !== null);
  const strangerNames = strangers.reduce((s, got) => s + got.length, 0);
  strangers.forEach((got, k) => { for (const x of got) wrongWhere.push(`${joinSpecs[k].join} ${name(joinSpecs[k].a)} → ${name(joinSpecs[k].b)} (not in the library) named ${x.isrc} at ${x.at.toFixed(0)} s`); });
  if (wrongWhere.length) console.log(`  wrong names: ${wrongWhere.join('; ')}`);
  console.log(`  a capture every twelve seconds, 6 s crossfades: median ${med(late12).toFixed(1)} s; with the new song not in the library, over all ${joinSpecs.length} joins: ${strangerNames} names\n`);

  const xf = ['xfade6', 'xfade16'].map((j) => byJoin[j]);
  check('every crossfade\'s new song is named by song identification', xf.every((o) => o.hits === o.n), xf.map((o) => `${o.hits}/${o.n}`).join(', '));
  check('and it never names a wrong song: in a join, in a whole song, or when the new song is not in the library',
    Object.values(byJoin).every((o) => o.wrong === 0) && wrongWhole === 0 && strangerNames === 0,
    `${Object.values(byJoin).reduce((s, o) => s + o.wrong, 0)} in joins, ${wrongWhole} in whole songs, ${strangerNames} for a stranger`);
  check('each join changes the look once, with the gap and the name through the hook\'s gate (no song twice)',
    twice === 0 && never === 0, `${twice} twice, ${never} never, of ${results.filter((r) => r.spec.kind === 'join').length}`);
  check('sanity: a capture every six seconds names a crossfade sooner than every twelve', med(byJoin.xfade6.late) < med(late12),
    `${med(byJoin.xfade6.late).toFixed(1)} s vs ${med(late12).toFixed(1)} s`);

  const passed = checks.filter(Boolean).length;
  console.log(`\n${passed}/${checks.length} checks passed`);
  process.exit(passed === checks.length ? 0 : 1);
}
