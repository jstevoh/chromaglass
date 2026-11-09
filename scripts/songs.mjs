#!/usr/bin/env node
/**
 * Does a song's show do what its list says, when it says?
 *
 *   npm run songs
 *
 * Drives whole songs through the pure scheduler in `lib/songShows.ts`, second
 * by second, with a song map and a kick clock, and checks each action fires
 * when and as often as its "when" says: the first note once, a time once,
 * every chorus once each, the second chorus only on the second, every fourth
 * kick on the fourth, eighth and twelfth, and the countdown to the end once.
 * Then files: a show and an action set survive the trip out and back in, and a
 * file that is not one is refused with a sentence.
 */

import {
  dueActions, showFor, parseFile, showsFile, setFile, parseShows,
  COMMON_ACTIONS, BUILT_IN_SETS, actionFrom, describeWhen, describeWhat,
  parseSongAction, pourGesture, sectionsAt, SONG_SHOW_TICK_MS, songShowTime,
} from '../src/lib/songShows.ts';
import { readFileSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A three-minute song: intro, verse, chorus, verse, chorus, bridge, chorus, outro. */
const MAP = [
  [0, 12, 'intro'], [12, 40, 'verse'], [40, 62, 'chorus'], [62, 90, 'verse'],
  [90, 112, 'chorus'], [112, 134, 'bridge'], [134, 164, 'chorus'], [164, 180, 'outro'],
];
const DURATION = 180, BPM = 120;

/** Run a show through the song and say, for each action, the times it fired. */
function play(show) {
  const fired = new Map();
  const log = new Map(show.actions.map((a) => [a.id, []]));
  const counts = {};
  let lastIndex = -1;
  for (let t = 0; t <= DURATION; t += 0.25) {
    const index = MAP.findIndex(([s, e]) => t >= s && t < e);
    if (index !== lastIndex && index >= 0) {
      const kind = MAP[index][2];
      counts[kind] = (counts[kind] ?? 0) + 1;
      lastIndex = index;
    }
    const clock = {
      t, duration: DURATION,
      section: index >= 0 ? { label: MAP[index][2], index } : null,
      sectionCounts: { ...counts },
      kicks: Math.floor(t * BPM / 60),
    };
    for (const a of dueActions(show, clock, fired)) log.get(a.id).push(t);
  }
  return log;
}

const act = (when, what) => ({ id: `a${Math.random().toString(36).slice(2, 8)}`, when, what });

// ── 1. Each kind of "when" fires when it says, as often as it says ───
{
  const A = {
    start: act({ at: 'start' }, { do: 'title' }),
    time: act({ at: 'time', sec: 60 }, { do: 'drain' }),
    choruses: act({ at: 'section', section: 'chorus' }, { do: 'zoom', zoom: 4, over: 3 }),
    second: act({ at: 'section', section: 'chorus', nth: 2 }, { do: 'kaleidoscope', folds: 6 }),
    every: act({ at: 'section', section: 'any' }, { do: 'dyes' }),
    kicks: act({ at: 'kick', every: 4 }, { do: 'burst' }),
    end: act({ at: 'before-end', sec: 6 }, { do: 'signoff' }),
  };
  const show = { id: 's', song: { title: 'T', artist: 'A' }, look: { kind: 'preset', id: 'classic' }, actions: Object.values(A) };
  const log = play(show);
  const at = (k) => log.get(A[k].id);
  check('the first note fires once, at the start', at('start').length === 1 && at('start')[0] === 0, JSON.stringify(at('start')));
  check('a time fires once, at that time', at('time').length === 1 && at('time')[0] === 60, JSON.stringify(at('time')));
  check('"every chorus" fires once at each of the three', JSON.stringify(at('choruses')) === '[40,90,134]', JSON.stringify(at('choruses')));
  check('"the second chorus" fires only there', JSON.stringify(at('second')) === '[90]', JSON.stringify(at('second')));
  check('"every new section" fires at each of the eight', at('every').length === 8, `${at('every').length}`);
  // 120 bpm: a kick every half second, so every fourth kick is every two seconds.
  check('"every 4th kick" fires on the 4th, 8th, 12th…', at('kicks').length === 90 && at('kicks')[0] === 2 && at('kicks')[1] === 4,
    `${at('kicks').length} times, first at ${at('kicks')[0]} s`);
  check('the countdown fires once, six seconds before the end', JSON.stringify(at('end')) === '[174]', JSON.stringify(at('end')));
}

// ── 2. A song finds its show, and only its show ───────────────────────
{
  const shows = [
    { id: 'a', song: { title: 'Wish You Were Here', artist: 'Pink Floyd' }, look: { kind: 'preset', id: 'classic' }, actions: [] },
    { id: 'b', song: { title: 'Comfortably Numb', artist: 'Pink Floyd' }, look: { kind: 'preset', id: 'galaxy' }, actions: [] },
  ];
  check('a song finds its show through the usual noise in a title',
    showFor(shows, { title: 'Wish You Were Here (Remastered 2011)', artist: 'Pink Floyd' })?.id === 'a');
  check('and another song does not', showFor(shows, { title: 'Money', artist: 'Pink Floyd' }) === null);
}

// ── 3. Files: out and back in, and a file that is not one ─────────────
{
  const show = {
    id: 'x', song: { title: 'Hey Jude', artist: 'The Beatles' }, look: { kind: 'saved', id: 'user-1', name: 'My look' },
    actions: COMMON_ACTIONS.map(actionFrom),
  };
  const back = parseFile(showsFile([show])).shows;
  check('a song and all its actions survive a file', back?.length === 1 && back[0].actions.length === COMMON_ACTIONS.length
    && JSON.stringify(back[0].actions.map((a) => a.what)) === JSON.stringify(show.actions.map((a) => a.what)));
  const set = BUILT_IN_SETS[1];
  const sb = parseFile(setFile(set)).set;
  check('an action set survives a file, as a new set of your own', !!sb && sb.name === set.name && sb.actions.length === set.actions.length && sb.id !== set.id && !sb.builtIn);
  let msg = '';
  try { parseFile('{"kind":"something-else"}'); } catch (e) { msg = e.message; }
  check('a file that is not one is refused with a sentence', /not a ChromaGlass/.test(msg), msg);
  const junk = parseShows([{ song: { title: 'A', artist: 'B' }, look: { kind: 'preset', id: 'classic' }, actions: [{ when: { at: 'never' }, what: { do: 'drain' } }] }]);
  check('an action with a "when" this build does not know is dropped, not guessed', junk.length === 1 && junk[0].actions.length === 0);
}

// ── 4. A pour on the drop (PLAN 44f) ──────────────────────────────────
// The owner's assistant cannot hit a beat; it programs one, and the show's
// own clock fires it. So the pour must fire on the very frame the second
// drop begins, and on no frame before, at sixty frames a second, with the
// sections found the way the runtime finds them (`sectionsAt`), at starts
// that are not on any whole frame.
{
  const SECTIONS = [
    { start: 0, end: 15.37, label: 'intro' }, { start: 15.37, end: 30.81, label: 'build' },
    { start: 30.81, end: 46.2, label: 'drop' }, { start: 46.2, end: 61.66, label: 'break' },
    { start: 61.66, end: 77.03, label: 'build 2' }, { start: 77.03, end: 92.5, label: 'drop 2' },
    { start: 92.5, end: 110, label: 'outro' },
  ];
  const pour = parseSongAction({ when: { at: 'section', section: 'drop', nth: 2 }, what: { do: 'pour', color: '#2244FF', amount: 0.8, x: 0.3, y: 0.6, wall: true } });
  check('a pour programmed from outside is read as a song action', pour?.what.do === 'pour' && pour.what.color === '#2244ff' && pour.what.amount === 0.8 && pour.what.wall === true && pour.when.nth === 2, JSON.stringify(pour));
  const show = { id: 'p', song: { title: 'T', artist: 'A' }, look: { kind: 'preset', id: 'classic' }, actions: [pour] };
  const fired = new Map();
  const at = [];
  for (let f = 0; f <= 110 * 60; f++) {
    const t = f / 60;
    const clock = { t, duration: 110, ...sectionsAt(SECTIONS, t), kicks: Math.floor(t * 2) };
    if (dueActions(show, clock, fired).length) at.push(f);
  }
  const first = Math.ceil(77.03 * 60);
  check('a pour on the second drop fires on the frame the section starts, once, and not before', at.length === 1 && at[0] === first,
    `fired on frame ${JSON.stringify(at)}; the drop starts on frame ${first} (${(first / 60).toFixed(3)} s)`);
  /*
    The same drop through the runtime's own reading (hooks/useSongShows.ts
    calls songShowTime on every tick): a tick every SONG_SHOW_TICK_MS of
    wall time, at forty phases against the song, the song's live position
    behind `positionNow` and the music hook's twice-a-second position
    behind `positionSec`, as the app has them. How late the pour lands
    after the drop begins, at worst, must be under a frame. The old reading
    (no positionNow, a 100 ms tick) is played the same way and printed. The
    runtime's own wiring of these is React and is read as text below.
  */
  const lateness = (tickMs, withNow) => {
    let worst = 0;
    for (let k = 0; k < 40; k++) {
      const f2 = new Map();
      for (let wall = (k / 40) * 500; wall <= 110_000; wall += tickMs) {
        const stale = Math.floor(wall / 500) * 0.5;
        const t = songShowTime({ manual: false, startedAt: 0 }, wall, stale, withNow ? () => wall / 1000 : undefined);
        if (dueActions(show, { t, duration: 110, ...sectionsAt(SECTIONS, t), kicks: 0 }, f2).length) { worst = Math.max(worst, wall / 1000 - 77.03); break; }
      }
    }
    return worst;
  };
  const now = lateness(SONG_SHOW_TICK_MS, true), was = lateness(100, false);
  check('through the runtime\'s reading the pour lands within a frame of the drop', now <= 1 / 60 + 1e-9,
    `worst ${(now * 1000).toFixed(1)} ms late at a tick of ${SONG_SHOW_TICK_MS.toFixed(1)} ms (the old reading: ${(was * 1000).toFixed(0)} ms)`);
  const src = (f) => readFileSync(f, 'utf8');   // npm runs this from the root, and the bundle lives elsewhere
  const shows = src('src/hooks/useSongShows.ts'), score = src('src/app/useSongScore.ts'), intel = src('src/hooks/useMusicIntelligence.ts');
  check('and the app is wired to it: the show ticks at SONG_SHOW_TICK_MS on songShowTime, handed the music hook\'s positionNow',
    /songShowTime\(run, showNow\(\), x\.positionSec, x\.positionNow\)/.test(shows) && /\}, SONG_SHOW_TICK_MS, 'song-show'\)/.test(shows)
    && /positionNow: musicIntel\.positionNow/.test(score) && /resetNudge, positionNow,\n/.test(intel), '');
  const g = pourGesture(pour.what, (x, y) => ({ x: 1 - x, y }));
  check('it lays a drop of that dye, its wall point turned onto the plate when it fires', g.tool === 'drop' && g.color === '#2244ff' && g.amount === 0.8 && Math.abs(g.x - 0.7) < 1e-9 && g.y === 0.6, JSON.stringify(g));
  const mid = pourGesture(parseSongAction({ when: { at: 'start' }, what: { do: 'pour', color: '#ff0000' } }).what);
  check('a pour with no point lands in the middle, at the default amount', mid.x === 0.5 && mid.y === 0.5 && mid.amount === 0.6, JSON.stringify(mid));
  const bad = [
    parseSongAction({ when: { at: 'start' }, what: { do: 'pour', color: 'blue' } }),
    parseSongAction({ when: { at: 'start' }, what: { do: 'pour', color: 'url(javascript:x)' } }),
    parseSongAction({ when: { at: 'soon' }, what: { do: 'pour', color: '#ff0000' } }),
    parseSongAction({ when: { at: 'start' }, what: { do: 'explode' } }),
  ];
  check('a pour without a #rrggbb colour, or an unknown when or what, is refused, not guessed', bad.every((b) => b === null), JSON.stringify(bad));
  const big = parseSongAction({ when: { at: 'start' }, what: { do: 'pour', color: '#ff0000', amount: 40, x: -3, y: 9 } }).what;
  check('a pour\'s numbers are held to their ranges', big.amount === 1 && big.x === 0 && big.y === 1, JSON.stringify(big));
  const back = parseFile(showsFile([show])).shows?.[0]?.actions?.[0]?.what;
  check('a pour survives a file', JSON.stringify(back) === JSON.stringify(pour.what), JSON.stringify(back));
  check('and reads as a sentence', /^Pour #2244ff at 30%, 60%$/.test(describeWhat(pour.what)), describeWhat(pour.what));
}

// ── 5. Every common action reads as a sentence ────────────────────────
{
  const bad = COMMON_ACTIONS.filter((c) => !describeWhen(c.when) || !describeWhat(c.what));
  check('every common action says when and what in words', bad.length === 0, bad.map((c) => c.label).join(', '));
  check('the built-in sets are made of common actions', BUILT_IN_SETS.every((s) => s.actions.length > 0));
}

console.log('');
const failed = checks.filter((c) => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
