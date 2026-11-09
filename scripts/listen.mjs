#!/usr/bin/env node
/**
 * Does Listen name the song, wait for the show to hear it through, and design
 * a show that follows the song? (PLAN 28h-8)
 *
 *   npm run listen
 *
 * Listen (`lib/songDesign.ts`, run by `app/useListen.ts`) is two pure pieces,
 * and this drives both with a known song.
 *
 * The design is judged by what plays, not by what it wrote: its cues go
 * through the score (`scoreOf`), which runs the real scheduler over the song,
 * so "a burst on every chorus" passes only if the burst fires at 0:40, 1:30
 * and 2:14, where this song's choruses start; its stages are laid end to end
 * by their seconds, as the sequencer's `startAt` lays them, and each moment of
 * the song must land in the stage named for the section playing then, which
 * is what lets a song joined halfway start in the right stage. And the stages
 * must follow the song's energy against the song's own range: a ballad whose
 * loudest section is quieter than a rock song's verse still opens up for its
 * chorus, which an absolute scale would not.
 *
 * The flow is judged step by step on what the ear reports: nothing named for
 * forty-five seconds says so; a song named with no map waits; a map for
 * another song is not this song's; an analysis still running is not "too
 * short"; a song heard before is designed the moment it is named.
 *
 * And the map is in the song's seconds (PLAN 28h-9). The recorder starts when
 * the song is named, seconds in or halfway through, so the analysis measures
 * from the wrong zero. Here a song is "heard" from 0:30 the way the analysis
 * would hear it (its sections clipped and counted from the recording, the
 * first one called an intro by the analysis's own rule, its curves sliced),
 * moved by the lead the clock gives (`songSecAt`), and must then fire its
 * cues where the song's choruses really start, keep each moment in its own
 * section's stage, and read the same energy and harmony at every second as
 * the song does. Its fingerprint must make the real local matcher name the
 * song's position, not the recording's.
 */

import {
  designFromMap, listenStep, startListening, withDesign, listenLine, LISTEN_IDLE, LISTEN_GIVE_UP_MS, DESIGNED_CUE,
} from '../src/lib/songDesign.ts';
import { scoreOf } from '../src/lib/songScore.ts';
import { GLIDES, stageAtOffset } from '../src/lib/sequencer.ts';
import { songSecAt, shiftSongMap, shiftFingerprintFrames, FOLD_LEAD_SEC, CHROMA_RATE } from '../src/lib/songMapLead.ts';
import { FOLLOW_RATE } from '../src/lib/songFollow.ts';
import { extractPeakHashes, buildIndex, matchSnippet, FP_RATE } from '../src/lib/localFingerprint.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const mapOf = (rows, duration, isrc = 'SONG-A') => ({
  isrc, durationSec: duration, frameRate: 4, pitchCurve: [], generatedAt: 0,
  sections: rows.map(([start, end, label, energy]) => ({ start, end, label, energy })),
  energyCurve: Array.from({ length: duration * 4 }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i / 40))),
});
/** A three-minute song: intro, verse, chorus, verse, chorus, bridge, chorus, outro. */
const ROCK = mapOf([
  [0, 12, 'intro', 0.2], [12, 40, 'verse', 0.45], [40, 62, 'chorus', 0.85], [62, 90, 'verse', 0.5],
  [90, 112, 'chorus', 0.9], [112, 134, 'bridge', 0.4], [134, 164, 'chorus', 0.95], [164, 180, 'outro', 0.15],
], 180);

const show = (actions) => ({ id: 's', song: { title: 'T', artist: 'A' }, look: { kind: 'preset', id: 'classic' }, actions });
/** Where each designed cue fires, through the real scheduler, as `what@seconds`. */
const fires = (map, design) => scoreOf(map, show(design.actions)).cues.map((c) => `${c.what}@${c.at}`);
/** The stage the transport's `startAt` enters at t, through its own walk (`stageAtOffset`). */
const stageAt = (stages, t) => stages[stageAtOffset(stages, t, false).index];

// ── The design, on a rock song ───────────────────────────────────────
const rock = designFromMap(ROCK);
check('one stage per section, each as long as its section, the song end to end',
  rock.stages.length === 8 && rock.stages.every((st, i) => Math.abs(st.seconds - (ROCK.sections[i].end - ROCK.sections[i].start)) < 0.11)
  && Math.abs(rock.stages.reduce((t, st) => t + st.seconds, 0) - 180) < 0.5,
  rock.stages.map((st) => `${st.name} ${st.seconds}s`).join(', '));
const wrongStage = [];
for (let t = 0; t < 180; t += 0.5) {
  const sec = ROCK.sections.find((s) => t >= s.start && t < s.end);
  const st = stageAt(rock.stages, t);
  if (!st.name.toLowerCase().startsWith(sec.label)) wrongStage.push(`${t}s ${st.name}/${sec.label}`);
}
check('a song joined at any moment starts in the stage of the section playing then, and every stage hands over on its clock',
  wrongStage.length === 0 && rock.stages.every((st) => st.advance === 'time'),
  wrongStage.length ? wrongStage.slice(0, 4).join(', ') : '360 half-seconds, all in their section\'s stage');
const s = rock.stages, by = (n) => s.find((st) => st.name === n);
// Every setting a stage moves, not a chosen few: one that fell as the song
// got louder, or sat still, would read as the show not hearing the chorus.
const rideKeys = Object.keys(by('Intro').settings);
const louder = rideKeys.length === 6 && rideKeys.every((k) => by('Chorus 1').settings[k] > by('Verse 1').settings[k] && by('Verse 1').settings[k] > by('Intro').settings[k]);
check('the chorus is fuller, more stirred, rocked and pressed harder, with more bubbles, than the verse, and the verse than the intro (all six)', louder,
  `dye ${by('Intro').settings.dyeBudget} → ${by('Verse 1').settings.dyeBudget} → ${by('Chorus 1').settings.dyeBudget}`);
check('every designed setting is one a stage glides (GLIDES), so it moves rather than jumps',
  s.every((st) => Object.keys(st.settings).every((k) => GLIDES.some(([g]) => g === k))));
check('colours open from two dyes in the intro to the whole palette in the chorus; each verse turns one',
  by('Intro').paletteSize === 2 && by('Outro').paletteSize === 2 && by('Chorus 1').paletteSize === undefined
  && by('Verse 1').paletteLead === 0 && by('Verse 2').paletteLead === 1 && by('Bridge').paletteSize === 3 && by('Bridge').paletteLead === 2);
check('the bridge goes in close and the stage after it comes back out',
  by('Bridge').macro === true && by('Chorus 3').macro === false && by('Chorus 1').macro === undefined);
check('no glide is longer than half its stage, and up into a louder section is quicker than down',
  s.every((st) => st.transition <= st.seconds / 2 + 1e-9) && by('Chorus 1').transition < by('Verse 2').transition,
  `into chorus ${by('Chorus 1').transition} s, into verse ${by('Verse 2').transition} s`);
const rf = fires(ROCK, rock);
const want = ['Pour the title@0', 'Burst@40', 'Burst@90', 'Next dyes@112', 'Burst@134', 'Next dyes@134', 'Drain the plate@172'];
check('the cues fire on the song: the title on the first note, a burst on each chorus, new dyes for the bridge and the last chorus, the drain 8 s before the end',
  JSON.stringify([...rf].sort()) === JSON.stringify([...want].sort()), rf.join(', '));
check('the cues are pinned to sections, not seconds (the Score\'s rule): only the start and the end are not',
  rock.actions.every((a) => a.when.at === 'section' || a.when.at === 'start' || a.when.at === 'before-end'));

// ── A ballad: the song's own range, not an absolute one ─────────────────
const BALLAD = mapOf([[0, 20, 'intro', 0.08], [20, 70, 'verse', 0.14], [70, 110, 'chorus', 0.28], [110, 160, 'verse', 0.15], [160, 200, 'chorus', 0.3], [200, 220, 'outro', 0.06]], 220, 'B');
const ballad = designFromMap(BALLAD).stages;
check('a quiet ballad\'s chorus still opens up as far as a loud song\'s (energy against the song\'s own range)',
  ballad[4].settings.dyeBudget >= 0.9 && ballad[1].settings.dyeBudget < ballad[2].settings.dyeBudget,
  `ballad chorus at energy 0.3 → dye ${ballad[4].settings.dyeBudget}; verse ${ballad[1].settings.dyeBudget}`);

// ── No chorus found; one section ──────────────────────────────────────
const PLAIN = mapOf([[0, 30, 'verse', 0.3], [30, 70, 'verse', 0.7], [70, 100, 'bridge', 0.4], [100, 140, 'verse', 0.9], [140, 150, 'outro', 0.1]], 150, 'C');
const pf = fires(PLAIN, designFromMap(PLAIN));
check('a song with no chorus gets its burst on its loudest section', pf.includes('Burst@100') && pf.filter((f) => f.startsWith('Burst')).length === 1, pf.join(', '));
const ONE = { ...mapOf([[0, 90, 'song', 0.5]], 90, 'D'), energyCurve: Array.from({ length: 360 }, (_, i) => (i > 240 ? 0.9 : 0.2)) };
const one = designFromMap(ONE);
check('a map the analysis could not cut still gets stages that move, from its energy curve',
  one.stages.length === 3 && one.stages[2].settings.dyeBudget > one.stages[0].settings.dyeBudget && fires(ONE, one).includes('Burst@60'),
  `${one.stages.map((st) => `${st.name} ${st.settings.dyeBudget}`).join(', ')}; ${fires(ONE, one).join(', ')}`);

// ── Designing again ───────────────────────────────────────────────────
const mine = { id: 'act-1', when: { at: 'section', section: 'verse' }, what: { do: 'zoom', zoom: 1, over: 3 } };
const once = withDesign([mine], rock.actions);
const twice = withDesign(once, designFromMap(ROCK).actions);
check('designing again replaces the designed cues and keeps the person\'s own',
  twice.length === rock.actions.length + 1 && twice[0] === mine && twice.slice(1).every((a) => a.id.startsWith(DESIGNED_CUE)),
  `${once.length} then ${twice.length}`);

// ── The flow ──────────────────────────────────────────────────────────
const track = (isrc = 'SONG-A') => ({ isrc, title: 'Tiger Rag', artist: 'The Band', source: 'fingerprint', durationSec: 180 });
const ear = (o) => ({ now: 0, track: null, songMap: null, heardMap: null, analyzing: false, ...o });
const t0 = startListening(1000);
// In seconds, not the constant: what the panel promises is forty-five.
let r = listenStep(t0, ear({ now: 1000 + 44_000 }));
const stillListening = r.state.phase === 'listening';
r = listenStep(t0, ear({ now: 1000 + 45_001 }));
check('nothing named for 45 s says so, and not before', LISTEN_GIVE_UP_MS === 45_000 && stillListening && r.state.phase === 'missed', listenLine(r.state, true));
r = listenStep(t0, ear({ now: 2000, track: track() }));
check('a song named with no map yet goes into the list and waits to be heard through',
  r.state.phase === 'learning' && r.heard?.title === 'Tiger Rag' && r.heard?.artist === 'The Band' && r.heard?.durationSec === 180 && r.design === null,
  listenLine(r.state, true));
const learning = r.state;
r = listenStep(learning, ear({ track: track(), songMap: { ...ROCK, isrc: 'OTHER' } }));
const notOther = r.design === null && r.state.phase === 'learning';
r = listenStep(learning, ear({ track: null, heardMap: { ...ROCK, isrc: 'OTHER' }, analyzing: true }));
const analysisRunning = r.state.phase === 'learning';
r = listenStep(learning, ear({ track: null, heardMap: { ...ROCK, isrc: 'OTHER' }, analyzing: false }));
check('another song\'s map is not this song\'s; a song gone while its analysis runs is not "too short"; gone with no map is',
  notOther && analysisRunning && r.state.phase === 'short', listenLine(r.state, true));
// The next song starting is the other way a song goes (no silence between).
const nextSongAnalysing = listenStep(learning, ear({ track: track('OTHER'), analyzing: true })).state.phase;
const nextSongNoMap = listenStep(learning, ear({ track: track('OTHER'), analyzing: false })).state.phase;
check('a song cut off by the next one: waits while its analysis runs, then says it was too short',
  nextSongAnalysing === 'learning' && nextSongNoMap === 'short', `${nextSongAnalysing}, then ${nextSongNoMap}`);
r = listenStep(learning, ear({ track: track('OTHER'), heardMap: ROCK }));
check('a song cut off by the next one, long enough to map, is designed from its own map', r.design === ROCK);
r = listenStep(learning, ear({ track: null, heardMap: ROCK }));
check('the map its first listen made, kept after the song ended, is what it designs from', r.design === ROCK);
r = listenStep(t0, ear({ now: 1500, track: track(), songMap: ROCK }));
check('a song heard before is named and designed in one step', r.heard !== null && r.design === ROCK);
r = listenStep({ ...t0, phase: 'missed' }, ear({ track: { ...track(), source: 'manual' } }));
check('named by hand after a miss, it carries on as if heard (and keeps no made-up ISRC)',
  r.state.phase === 'learning' && r.heard?.isrc === undefined);
check('idle and designed do nothing', listenStep(LISTEN_IDLE, ear({ track: track(), songMap: ROCK })).design === null
  && listenStep({ ...learning, phase: 'designed' }, ear({ heardMap: ROCK })).design === null);

// ── The map in the song's seconds (PLAN 28h-9) ─────────────────────────
/**
 * What the analysis makes of `song` recorded from `lead` s in: its sections
 * cut where the song's are and counted from the recording, the first called
 * the intro if it is short and not a chorus (`segment`'s own rule), and its
 * curves from the recording's first frame.
 */
const heardFrom = (song, lead) => {
  const sections = song.sections.filter((x) => x.end > lead).map((x) => ({ ...x, start: Math.max(0, x.start - lead), end: x.end - lead }));
  if (sections[0] && sections[0].end - sections[0].start < 25 && sections[0].label !== 'chorus') sections[0].label = 'intro';
  const f = Math.round(lead * song.frameRate);
  return { ...song, durationSec: song.durationSec - lead, sections, energyCurve: song.energyCurve.slice(f), pitchCurve: song.pitchCurve.slice(f), chroma: song.chroma?.slice(Math.round(lead * 4) * 12) };
};
const SONG = { ...ROCK, pitchCurve: Array.from({ length: 720 }, (_, i) => 50 + (i % 24)), chroma: Array.from({ length: 720 * 12 }, (_, i) => ((i * 7919) % 1000) / 1000) };
// Named 0:30 into the song by a match taken at 5.0 s on the show's clock; the
// recorder got going 0.6 s later; a re-identification a minute on, 0.1 s
// wiser about where the song is, is the newest anchor when the listen ends.
const firstMatch = { offsetSec: 30, identifiedAtMs: 5000 }, reAnchored = { offsetSec: 90, identifiedAtMs: 65_100 };
const lead = songSecAt(reAnchored, 5600);
check('the recording\'s first sample is the song second the newest anchor puts it at; named by hand or with no clock, it is the start',
  Math.abs(lead - 30.5) < 1e-9 && Math.abs(songSecAt(firstMatch, 5600) - 30.6) < 1e-9
  && songSecAt({ offsetSec: undefined, identifiedAtMs: undefined }, 5600) === 0 && songSecAt(null, 5600) === 0 && songSecAt({ offsetSec: NaN, identifiedAtMs: 0 }, 1) === 0,
  `lead ${lead.toFixed(2)} s (first match alone said ${songSecAt(firstMatch, 5600).toFixed(2)})`);
const heard = heardFrom(SONG, 30);
const moved = shiftSongMap(heard, 30);
const choruses = (m) => m.sections.filter((x) => x.label === 'chorus').map((x) => x.start);
check('heard from 0:30, the map\'s choruses sit where the song\'s do (0:40, 1:30, 2:14), not 30 s early',
  JSON.stringify(choruses(moved)) === JSON.stringify([40, 90, 134]) && moved.durationSec === 180,
  `before ${choruses(heard).join(', ')} s; after ${choruses(moved).join(', ')} s`);
const unheardDesign = designFromMap(moved);
const mf = fires(moved, unheardDesign), bf = fires(heard, designFromMap(heard));
check('its designed cues fire on the song\'s own choruses, bridge and end',
  ['Burst@40', 'Burst@90', 'Next dyes@112', 'Burst@134', 'Next dyes@134', 'Drain the plate@172', 'Pour the title@0'].every((w) => mf.includes(w)),
  `before ${bf.filter((f) => !f.startsWith('Pour')).join(', ')}; after ${mf.filter((f) => !f.startsWith('Pour')).join(', ')}`);
const offStage = [];
for (let t = 0; t < 180; t += 0.5) {
  const want = t < 30 ? 'unheard' : SONG.sections.find((x) => t >= x.start && t < x.end).label;
  const st = stageAt(unheardDesign.stages, t);
  if (!st.name.toLowerCase().startsWith(want)) offStage.push(`${t}s ${st.name}/${want}`);
}
check('the part before the recording is one "Unheard" stage, and from 0:30 every moment is in its own section\'s stage (the one heard first a verse, not an intro)',
  offStage.length === 0 && unheardDesign.stages[0].name === 'Unheard' && unheardDesign.stages[1].name.startsWith('Verse'),
  offStage.length ? offStage.slice(0, 4).join(', ') : unheardDesign.stages.slice(0, 3).map((st) => `${st.name} ${st.seconds}s`).join(', '));
let curvesAgree = CHROMA_RATE === FOLLOW_RATE && moved.energyCurve.length === 720 && moved.pitchCurve.length === 720 && moved.chroma.length === 180 * FOLLOW_RATE * 12;
for (let f = 120; f < 720 && curvesAgree; f++) {
  if (moved.energyCurve[f] !== SONG.energyCurve[f] || moved.pitchCurve[f] !== SONG.pitchCurve[f]) curvesAgree = false;
  for (let k = 0; k < 12; k++) if (moved.chroma[f * 12 + k] !== SONG.chroma[f * 12 + k]) curvesAgree = false;
}
const silentBefore = moved.pitchCurve.slice(0, 120).every((p) => p === 0) && moved.chroma.slice(0, 120 * 12).every((c) => c === 0)
  && moved.energyCurve.slice(0, 120).every((e) => e === moved.sections[1].energy);
check('energy, pitch and harmony read the song\'s own values at every quarter second heard; before it, no pitch, no harmony and the first heard section\'s energy',
  curvesAgree && silentBefore);
const INTRO_SONG = mapOf([[0, 20, 'intro', 0.2], [20, 50, 'verse', 0.5], [50, 80, 'chorus', 0.9], [80, 100, 'outro', 0.1]], 100, 'E');
const midIntro = shiftSongMap(heardFrom(INTRO_SONG, 10), 10);
const firstSecs = shiftSongMap(heardFrom(ROCK, FOLD_LEAD_SEC - 2), FOLD_LEAD_SEC - 2);
// A song opening on a long verse (no intro to take it), matched 5 s in.
const verseFirst = shiftSongMap(heardFrom(PLAIN, 5), 5);
check('a first match a few seconds in (into an intro or a verse), or named in the intro, takes the unheard start into the first section rather than a stage of its own',
  firstSecs.sections.length === 8 && firstSecs.sections[0].start === 0 && firstSecs.sections[0].label === 'intro'
  && midIntro.sections.length === 4 && midIntro.sections[0].start === 0 && midIntro.sections[0].end === 20 && midIntro.sections[0].label === 'intro'
  && verseFirst.sections.length === PLAIN.sections.length && verseFirst.sections[0].start === 0 && verseFirst.sections[0].label === 'verse'
  && shiftSongMap(ROCK, 0) === ROCK,
  `named at 0:06: ${firstSecs.sections[0].label} ${firstSecs.sections[0].start}-${firstSecs.sections[0].end}; named at 0:10 of a 20 s intro: ${midIntro.sections[0].label} ${midIntro.sections[0].start}-${midIntro.sections[0].end}`);

// The fingerprint stored with the map, through the real local matcher. A
// made-up record: a chord of three tones every fifth of a second, seeded, so
// its peaks are sharp and never repeat.
const toneSong = (() => {
  const out = new Float32Array(90 * FP_RATE);
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const step = Math.round(0.2 * FP_RATE);
  for (let a = 0; a < out.length; a += step) {
    const fs = [0, 1, 2].map(() => 300 + rnd() * 3500);
    for (let i = a; i < Math.min(out.length, a + step); i++) for (const f of fs) out[i] += 0.2 * Math.sin((2 * Math.PI * f * i) / FP_RATE);
  }
  return out;
})();
const fpLead = 20;
const recorded = extractPeakHashes(toneSong.subarray(fpLead * FP_RATE), FP_RATE);
const indexOf = (frames) => buildIndex([{ isrc: 'TONES', hashes: recorded.hashes, frames, durationSec: recorded.durationSec, createdAt: 0 }]);
const snippet = toneSong.subarray(50 * FP_RATE, 54 * FP_RATE);
const after = matchSnippet(snippet, FP_RATE, indexOf(shiftFingerprintFrames(recorded.frames, fpLead)));
const before = matchSnippet(snippet, FP_RATE, indexOf(recorded.frames));
check('the fingerprint it stores names the song\'s position: a snippet ending at 0:54 matches at 0:54, not 20 s early',
  after && Math.abs(after.offsetSec - 54) < 0.25,
  `before ${before ? before.offsetSec.toFixed(2) : 'no match'} s; after ${after ? after.offsetSec.toFixed(2) : 'no match'} s`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} listen checks pass`);
if (failed.length) process.exit(1);
