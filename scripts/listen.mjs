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
 */

import {
  designFromMap, listenStep, startListening, withDesign, listenLine, LISTEN_IDLE, LISTEN_GIVE_UP_MS, DESIGNED_CUE,
} from '../src/lib/songDesign.ts';
import { scoreOf } from '../src/lib/songScore.ts';
import { GLIDES } from '../src/lib/sequencer.ts';

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
/** The stage `startAt` would enter at t: stages end to end by their seconds. */
function stageAt(stages, t) {
  let off = t, i = 0;
  for (; i < stages.length - 1; i++) { const len = Math.max(1, stages[i].seconds); if (off < len) break; off -= len; }
  return stages[i];
}

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
check('a song joined at any moment starts in the stage of the section playing then', wrongStage.length === 0,
  wrongStage.length ? wrongStage.slice(0, 4).join(', ') : '360 half-seconds, all in their section\'s stage');
const s = rock.stages, by = (n) => s.find((st) => st.name === n);
const louder = ['dyeBudget', 'turbulenceScale', 'audioImpact', 'beatSqueeze'].every((k) => by('Chorus 1').settings[k] > by('Verse 1').settings[k] && by('Verse 1').settings[k] > by('Intro').settings[k]);
check('the chorus is fuller, more stirred and pressed harder than the verse, and the verse than the intro', louder,
  `dye ${by('Intro').settings.dyeBudget} → ${by('Verse 1').settings.dyeBudget} → ${by('Chorus 1').settings.dyeBudget}`);
check('every designed setting is one a stage glides (GLIDES), so it moves rather than jumps',
  s.every((st) => Object.keys(st.settings).every((k) => GLIDES.some(([g]) => g === k))));
check('colours open from two dyes in the intro to the whole palette in the chorus; each verse turns one',
  by('Intro').paletteSize === 2 && by('Chorus 1').paletteSize === undefined && by('Verse 1').paletteLead === 0 && by('Verse 2').paletteLead === 1);
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
let r = listenStep(t0, ear({ now: 1000 + 10_000 }));
const stillListening = r.state.phase === 'listening';
r = listenStep(t0, ear({ now: 1000 + LISTEN_GIVE_UP_MS + 1 }));
check('nothing named for 45 s says so, and not before', stillListening && r.state.phase === 'missed', listenLine(r.state, true));
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
r = listenStep(learning, ear({ track: null, heardMap: ROCK }));
check('the map its first listen made, kept after the song ended, is what it designs from', r.design === ROCK);
r = listenStep(t0, ear({ now: 1500, track: track(), songMap: ROCK }));
check('a song heard before is named and designed in one step', r.heard !== null && r.design === ROCK);
r = listenStep({ ...t0, phase: 'missed' }, ear({ track: { ...track(), source: 'manual' } }));
check('named by hand after a miss, it carries on as if heard (and keeps no made-up ISRC)',
  r.state.phase === 'learning' && r.heard?.isrc === undefined);
check('idle and designed do nothing', listenStep(LISTEN_IDLE, ear({ track: track(), songMap: ROCK })).design === null
  && listenStep({ ...learning, phase: 'designed' }, ear({ heardMap: ROCK })).design === null);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} listen checks pass`);
if (failed.length) process.exit(1);
