#!/usr/bin/env node
/**
 * Does the score show the song's show where it fires, and does the nudge put
 * the show back in step? (PLAN 28h)
 *
 *   npm run score
 *
 * The score (`lib/songScore.ts`) draws each of a song show's actions where the
 * runtime will fire it. So this check does not compare the score with a list
 * of times written here: it plays the song through the runtime's own path, a
 * quarter-second at a time (`sectionsAt` and `dueActions`, as
 * `useSongShows` calls them), writes down when each action really fired, and
 * asks that the score drew every one of those, and nothing else, within a
 * step. A score that drew a cue at the second chorus while the scheduler
 * fired it at the third would fail here even if both looked plausible.
 *
 * Then the two things the score is for:
 *
 *   - **A live take.** Read through the position PLAN 28g's follower will
 *     hand over (the map's own seconds, slowed through a stretched verse,
 *     jumping a skipped bridge), each chorus's cue fires on the chorus as
 *     played and the skipped bridge's cue does not fire.
 *   - **The nudge.** A song map whose chorus edge is three seconds late (an
 *     estimate from one listen): without a nudge the chorus's cue fires three
 *     seconds after the song's chorus; "Next section now", pressed when the
 *     chorus is heard, fires it then. "Section starts now", pressed when the
 *     show got there early, takes the position back to the section's start
 *     and does not fire its cue a second time.
 */

import { dueActions, sectionsAt, newId } from '../src/lib/songShows.ts';
import { scoreOf, playhead, nudgeFor, nudgeStep, pinWhen, sectionName, nudgeLabel } from '../src/lib/songScore.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const STEP = 0.25;
/** A three-minute song: intro, verse, chorus, verse, chorus, bridge, chorus, outro. */
const SECTIONS = [
  [0, 12, 'intro', 0.2], [12, 40, 'verse', 0.45], [40, 62, 'chorus', 0.85], [62, 90, 'verse', 0.5],
  [90, 112, 'chorus', 0.9], [112, 134, 'bridge', 0.4], [134, 164, 'chorus', 0.95], [164, 180, 'outro', 0.15],
].map(([start, end, label, energy]) => ({ start, end, label, energy }));
const DURATION = 180;
const MAP = { durationSec: DURATION, sections: SECTIONS, energyCurve: Array.from({ length: DURATION * 4 }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i / 40))) };

const act = (when, what = { do: 'burst' }) => ({ id: newId('act'), when, what });
const SHOW = {
  id: 'show-1', song: { title: 'Test Song', artist: 'Nobody' }, look: { kind: 'preset', id: 'classic' },
  actions: [
    act({ at: 'start' }, { do: 'title' }),
    act({ at: 'time', sec: 30 }, { do: 'dyes' }),
    act({ at: 'section', section: 'chorus' }, { do: 'zoom', zoom: 4, over: 3 }),
    act({ at: 'section', section: 'chorus', nth: 2 }, { do: 'kaleidoscope', folds: 6 }),
    act({ at: 'section', section: 'any', nth: 6 }, { do: 'drain' }),
    act({ at: 'section', section: 'verse' }, { do: 'zoom', zoom: 1, over: 3 }),
    act({ at: 'before-end', sec: 8 }, { do: 'blackout', over: 4 }),
    act({ at: 'kick', every: 4 }, { do: 'burst' }),
  ],
};

/**
 * Play a show as the runtime does: the position (map seconds) from `posAt`
 * at each real time, and what fired when. `posAt` is the clock the show
 * reads, so a nudge or a live take's warp is just a different `posAt`.
 */
function play(show, posAt, sections = SECTIONS, until = DURATION) {
  const fired = new Map();
  const log = [];
  const timed = { ...show, actions: show.actions.filter((a) => a.when.at !== 'kick') };
  for (let real = 0; real <= until + 1e-9; real += STEP) {
    const t = posAt(real);
    const clock = { t, duration: DURATION, ...sectionsAt(sections, t), kicks: 0 };
    for (const a of dueActions(timed, clock, fired)) log.push({ id: a.id, real, t });
  }
  return log;
}

// ── 1. The lane is the song ───────────────────────────────────────────
const score = scoreOf(MAP, SHOW);
check('the lane has every section, end to end, in order',
  score.sections.length === SECTIONS.length && score.sections.every((s, i) => s.start === SECTIONS[i].start && s.end === SECTIONS[i].end)
    && Math.abs(score.sections[0].x0) < 1e-9 && Math.abs(score.sections[score.sections.length - 1].x1 - 1) < 1e-9,
  `${score.sections.length} sections, ${score.duration} s`);
check('each section is counted as the runtime counts it (the third chorus is Chorus 3)',
  score.sections[6].kind === 'chorus' && score.sections[6].nth === 3 && sectionName(score.sections[6], score.sections) === 'Chorus 3'
    && sectionName(score.sections[0], score.sections) === 'Intro',
  score.sections.map((s) => sectionName(s, score.sections)).join(', '));
check('the energy curve is drawn, scaled to its loudest',
  score.energy.length === 160 && Math.abs(Math.max(...score.energy) - 1) < 1e-9 && Math.min(...score.energy) > 0,
  `${score.energy.length} points`);

// ── 2. Every cue drawn where it fires, and only there ─────────────────
const real = play(SHOW, (r) => r);
const near = (a, b) => Math.abs(a - b) <= STEP + 1e-9;
const missing = real.filter((f) => !score.cues.some((c) => c.actionId === f.id && near(c.at, f.t)));
const extra = score.cues.filter((c) => !real.some((f) => f.id === c.actionId && near(c.at, f.t)));
check('the score draws every action where the scheduler fires it, and nothing it does not fire',
  real.length === 10 && missing.length === 0 && extra.length === 0 && score.cues.length === real.length,
  `${real.length} firings, ${score.cues.length} cues drawn${missing.length ? `, missing ${missing.map((m) => m.t).join(',')}` : ''}${extra.length ? `, extra ${extra.map((c) => c.at).join(',')}` : ''}`);
check('a cue on every chorus is drawn on each of the three, the second chorus only on the second',
  score.cues.filter((c) => c.actionId === SHOW.actions[2].id).map((c) => c.at).join() === '40,90,134'
    && score.cues.filter((c) => c.actionId === SHOW.actions[3].id).map((c) => c.at).join() === '90',
  `every: ${score.cues.filter((c) => c.actionId === SHOW.actions[2].id).map((c) => c.at)}; second: ${score.cues.filter((c) => c.actionId === SHOW.actions[3].id).map((c) => c.at)}`);
check('a kick cue is listed beside the lane, not placed on it',
  score.loose.length === 1 && score.loose[0].actionId === SHOW.actions[7].id && !score.cues.some((c) => c.actionId === SHOW.actions[7].id));
check('a song with no show is still a score, with no cues', (() => { const s = scoreOf(MAP, null); return s.sections.length === 8 && s.cues.length === 0; })());

// ── 3. Pinning on the score ───────────────────────────────────────────
const chorus2 = score.sections[4];
const pinOne = act(pinWhen(chorus2, false));
const pinAll = act(pinWhen(chorus2, true));
const pinned = play({ ...SHOW, actions: [pinOne, pinAll] }, (r) => r);
check('pinned to this chorus fires on the second chorus only; to every chorus, on all three',
  pinned.filter((f) => f.id === pinOne.id).map((f) => f.t).join() === '90'
    && pinned.filter((f) => f.id === pinAll.id).map((f) => f.t).join() === '40,90,134',
  `this: ${pinned.filter((f) => f.id === pinOne.id).map((f) => f.t)}; every: ${pinned.filter((f) => f.id === pinAll.id).map((f) => f.t)}`);
const whole = [{ start: 0, end: 180, label: 'song', energy: 0.5 }];
const wholeScore = scoreOf({ durationSec: 180, sections: whole, energyCurve: [] }, null);
const wholePin = act(pinWhen(wholeScore.sections[0], true));
check('a section a show cannot name ("song") is pinned by its place, and fires there',
  wholeScore.sections[0].kind === null && pinWhen(wholeScore.sections[0], true).section === 'any' && pinWhen(wholeScore.sections[0], true).nth === 1
    && play({ ...SHOW, actions: [wholePin] }, (r) => r, whole).length === 1);

// ── 4. A live take, read through the follower's position ──────────
/*
  The band plays the first verse half again as long (28 s of map heard as
  42 s) and skips the bridge (straight from the second chorus into the
  third). PLAN 28g's follower reports where the take is in the map's own
  seconds, so map time runs slow through the verse and jumps over the bridge.
  Read through that, the cues pinned on the score must land on the sections
  as they are played: the first chorus at 54 s heard, the second at 104, the
  third at 126, where the bridge would have begun, and the bridge's own cue
  not at all, because the bridge was never played.
*/
const warp = (r) => (r < 12 ? r : r < 54 ? 12 + (r - 12) / 1.5 : r < 126 ? r - 14 : r + 8);
const onChorus = act(pinWhen(score.sections[2], true));
const onBridge = act(pinWhen(score.sections[5], false));
const take = play({ ...SHOW, actions: [onChorus, onBridge] }, warp, SECTIONS, DURATION);
const chorusAt = take.filter((f) => f.id === onChorus.id).map((f) => f.real);
check('a live take that stretches the verse and skips the bridge fires each chorus as it is played, and no bridge cue',
  chorusAt.length === 3 && near(chorusAt[0], 54) && near(chorusAt[1], 104) && near(chorusAt[2], 126) && !take.some((f) => f.id === onBridge.id),
  `choruses at ${chorusAt.join(', ')} s heard; bridge cue ${take.some((f) => f.id === onBridge.id) ? 'fired' : 'not fired'}`);

// ── 5. The nudge ──────────────────────────────────────────────────────
/*
  The map's first chorus starts at 40 s, but the song really turns at 37 s:
  the map's edge is three seconds late. Unnudged, the chorus cue fires at 40.
  Pressed when the chorus is heard (real 37 s), "Next section now" moves the
  position to 40 and the cue fires at 37.
*/
const lateCue = act(pinWhen(score.sections[2], false));
const unnudged = play({ ...SHOW, actions: [lateCue] }, (r) => r).find((f) => f.id === lateCue.id)?.real;
const pressAt = 37;
const toNext = nudgeFor(score, pressAt, 'next-section');
const nudged = play({ ...SHOW, actions: [lateCue] }, (r) => (r < pressAt ? r : r + toNext)).find((f) => f.id === lateCue.id)?.real;
check('"Next section now" fires the next section\'s cue when it is pressed, not when the map says',
  toNext !== null && Math.abs(toNext - 3) < 1e-9 && near(unnudged, 40) && near(nudged, pressAt),
  `unnudged ${unnudged} s, nudged ${nudged} s (moved ${toNext} s)`);
const head = playhead(score, pressAt + toNext);
check('after it, the playhead is at the start of that section', head.index === 2 && Math.abs(head.intoSection) < 1e-9, `section ${head.index}, ${head.intoSection} s in`);

/*
  The other way: the map's second chorus starts at 90, the song turns at 93.
  The show is in the chorus three seconds early; "Section starts now" pressed
  at 93 takes the position back to 90. The chorus's cue fired at 90 already
  and must not fire again: the runtime keys a section's firing by its index.
*/
const earlyCue = act(pinWhen(score.sections[4], false));
const backAt = 93;
const toStart = nudgeFor(score, backAt, 'section-start');
const early = play({ ...SHOW, actions: [earlyCue] }, (r) => (r < backAt ? r : r + toStart)).filter((f) => f.id === earlyCue.id);
check('"Section starts now" takes the position back to the section\'s start, without firing its cue twice',
  Math.abs(toStart + 3) < 1e-9 && early.length === 1 && playhead(score, backAt + toStart).intoSection === 0,
  `moved ${toStart} s, fired ${early.length}×`);
check('there is nowhere to go past the last section, and none before the first section begins',
  nudgeFor(score, 170, 'next-section') === null && nudgeFor({ sections: [{ start: 5, end: 10 }] }, 2, 'section-start') === null
    && nudgeFor({ sections: [{ start: 5, end: 10 }] }, 2, 'next-section') === 3);
check('the fine nudge is a beat at the tempo heard, half a second without one',
  Math.abs(nudgeStep(120) - 0.5) < 1e-9 && Math.abs(nudgeStep(90) - 2 / 3) < 1e-9 && nudgeStep(0) === 0.5 && nudgeStep(400) === 0.5);
check('the nudge reads as signed seconds, and as nothing at none',
  nudgeLabel(0) === '' && nudgeLabel(1.25) === '+1.3 s' && nudgeLabel(-3) === '−3.0 s');

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} score checks pass`);
if (failed.length) process.exit(1);
