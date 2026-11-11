import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pickLook, forgetPicks, liquidOf, RECENT } from '../src/lib/lookPick.ts';
import { isPackLocked, canUseMoirePack } from '../src/lib/tierGates.ts';
import { luckyLook, LUCKY_SHEETS_CHANCE } from '../src/lib/lucky.ts';
import { MOIRE_LOOKS } from '../src/presetsMoire.ts';
import { PIN_RANGE } from '../src/lib/deskPins.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { PRESETS } from '../src/presets.ts';

// ── Random looks: the moiré pack is one choice, owned, and never the same liquid twice (PLAN 45a-13) ──
// Part of `npm run panel`, in a module of its own because panel.mjs is at its size ceiling.
/*
  The owner, 2026-11-11: "the randomize button picks the moiré patterns way
  too frequently". Two causes, both measured here. The pickers (the phone's
  Surprise me, a new song in "New preset" mode, the opening look) drew evenly
  from every shipped look, and the pack's seven looks were seven entries in
  thirty-eight: moiré on one pick in 5.4, on copies without the pack too. And
  Randomise kept every setting it did not name, the sheets among them, so after
  one moiré look every roll was a new liquid under the same sheets. These
  assert the picker's weighting, its lock and its memory, and the roll taking
  the sheets off, over seeded runs long enough to measure a share.
*/
export function randomLooks({ check }) {
  let seed = 20261111;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const house = PRESETS.filter(p => !p.pack && !p.settings.macroMode);
  const packLooks = PRESETS.filter(p => p.pack === 'moire');
  const N = 20000;

  const run = (opts) => {
    forgetPicks();
    let current = 'classic', moire = 0, repeat = 0;
    const seen = new Set(), recentLiquids = [];
    for (let i = 0; i < N; i++) {
      const next = pickLook(PRESETS, rand, { currentId: current, ...opts });
      if (next.pack) moire++;
      const liquid = liquidOf(next.id);
      if (liquid === liquidOf(current) || recentLiquids.includes(liquid)) repeat++;
      // Six, written here rather than read from RECENT: a memory edited down to
      // nothing would otherwise pass by checking only the look on the plate.
      recentLiquids.push(liquid); if (recentLiquids.length > 6) recentLiquids.shift();
      if (i < 200) seen.add(next.id);
      current = next.id;
    }
    return { moire, repeat, seen };
  };

  const open = run({});
  const share = open.moire / N;
  check('a random look counts the moiré pack as one choice, not seven: about one pick in sixteen, not one in five',
    // A fixed band, not one read from PACK_WEIGHT: a pack that never comes up
    // is as wrong as one that comes up every fifth pick.
    packLooks.length >= 7 && share > 0.04 && share < 0.09,
    `${(share * 100).toFixed(1)}% moiré over ${N} picks (${packLooks.length} pack looks, ${house.length} house; an even pick was ${(packLooks.length / (PRESETS.length - 3 - 1) * 100).toFixed(1)}%)`);
  check('a random look never lands on the liquid on the plate or one of the last six picked',
    RECENT >= 6 && open.repeat === 0, `${open.repeat} repeats over ${N} picks, memory ${RECENT}`);
  check('two hundred random looks reach nearly every house liquid',
    house.filter(p => open.seen.has(p.id)).length >= house.length * 0.9,
    `${house.filter(p => open.seen.has(p.id)).length} of ${house.length} house looks in the first 200`);

  const locked = run({ locked: (pack) => pack === 'moire' });
  check('a copy without the moiré pack is never handed one of its looks at random',
    locked.moire === 0, `${locked.moire} pack looks over ${N} locked picks`);
  // And the lock the app hands it is tierGates' own: open here (no tiers
  // enforced in a node check), so isPackLocked must leave the pack in play.
  check('the app\'s lock is isPackLocked, which leaves the pack in where this copy has it',
    canUseMoirePack() && !isPackLocked('moire') && !isPackLocked(undefined));

  // The opening look: the same picker, the options shared.ts gives it, over fresh seeds.
  const openings = new Set();
  let openPack = 0;
  for (let k = 1; k <= 60; k++) {
    forgetPicks();
    let s2 = k * 7919;
    const r2 = () => { s2 = (s2 * 16807) % 2147483647; return s2 / 2147483647; };
    const o = pickLook(PRESETS, r2, { locked: (pack) => !!pack });
    if (!o) continue;
    openings.add(o.id); if (o.pack) openPack++;
  }
  check('the app opens on many different house looks and never on an art pack\'s',
    openings.size >= 20 && openPack === 0, `${openings.size} different opening looks over 60 seeds, ${openPack} pack looks`);

  let kept = 0;
  let named = 0;
  for (const m of packLooks) for (let i = 0; i < 50; i++) {
    const out = luckyLook({ ...DEFAULT_SETTINGS, ...m.settings }, ['#ff0000'], rand);
    // A number, not a missing key read as zero: the roll must say "off".
    if (typeof out.moireAmount === 'number') named++;
    if (!(out.moireAmount === 0)) kept++;
  }
  check('Randomise takes the moiré sheets off the look it replaces rather than keeping them under every roll',
    packLooks.every(m => (m.settings.moireAmount ?? 0) > 0) && named === packLooks.length * 50 && kept === 0,
    `${kept} of ${packLooks.length * 50} rolls from a moiré look kept its sheets`);

  /*
    And now and then a pair of sheets of its own, on a copy with the pack
    (the owner, 2026-11-11: "for the sheets - now and then is fine"). The
    share is held to a fixed band, the pair to a whole stage of one of the
    pack's looks, the lamp to the one sheets are seen by (Lamp Ground 1, no
    LED ring), every sheet number to the desk's range, and the rest of a
    seeded roll to what it is without the pack: owning it moves nothing else.
  */
  {
    const ROLLS = 4000;
    const mul = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const SHEET = new Set(['moireAmount', 'moireSheetA', 'moireSheetB', 'moireAngle', 'moireSpin', 'moireSlide',
      'moireRatio', 'moireDensity', 'moireGap', 'moireCurl', 'moireFlip', 'lampGround', 'ledPlatform']);
    const stages = MOIRE_LOOKS.map(m => `${m.settings.moireSheetA}/${m.settings.moireSheetB}/${m.settings.moireDensity}/${m.settings.moireGap}`);
    let laid = 0, unowned = 0, badLamp = 0, badStage = 0, drift = 0;
    const out = new Set();
    for (let i = 0; i < ROLLS; i++) {
      const owned = luckyLook(DEFAULT_SETTINGS, ['#ff0000'], mul(i * 7919 + 17), true);
      const not = luckyLook(DEFAULT_SETTINGS, ['#ff0000'], mul(i * 7919 + 17), false);
      if ((not.moireAmount ?? 0) > 0) unowned++;
      for (const k of Object.keys(not)) if (!SHEET.has(k) && JSON.stringify(owned[k]) !== JSON.stringify(not[k])) drift++;
      if (!(owned.moireAmount > 0)) continue;
      laid++;
      if (owned.lampGround !== 1 || owned.ledPlatform !== false) badLamp++;
      if (!stages.includes(`${owned.moireSheetA}/${owned.moireSheetB}/${owned.moireDensity}/${owned.moireGap}`)) badStage++;
      for (const k of SHEET) {
        const spec = PIN_RANGE.get(k);
        if (spec && typeof owned[k] === 'number' && (owned[k] < spec.min || owned[k] > spec.max)) out.add(`${k} ${owned[k]}`);
      }
    }
    const share = laid / ROLLS;
    check('Randomise lays a pair of moiré sheets now and then on a copy with the pack, and never on one without',
      LUCKY_SHEETS_CHANCE > 0 && share > 0.04 && share < 0.09 && unowned === 0,
      `${laid} of ${ROLLS} rolls (${(share * 100).toFixed(1)}%) with the pack, ${unowned} without`);
    check('and each pair is one of the pack\'s looks\' whole stages, seen by a white lamp on Lamp Ground',
      laid > 0 && badStage === 0 && badLamp === 0 && out.size === 0,
      `${badStage} stages no look has, ${badLamp} on the wrong lamp, outside the desk: ${[...out].join(', ') || 'none'}`);
    check('and owning the pack moves nothing else a seeded roll lands on', drift === 0, `${drift} settings differ over ${ROLLS} paired rolls`);
  }

  const sharedSrc = readFileSync('src/app/shared.ts', 'utf8');
  const fadesSrc = readFileSync('src/app/useSongChangeFades.ts', 'utf8');
  const appSrc = readFileSync('src/App.tsx', 'utf8');
  check('every random look picker goes through pickLook: the opening look (no pack), Surprise me and a new song (the pack\'s lock)',
    /pickLook\(PRESETS, stream\('show\.opening'\)\.float, \{ locked: \(pack\) => !!pack \}\)/.test(sharedSrc) &&
    /locked: isPackLocked/.test(sharedSrc) && /randomLook\(activePresetId, stream\('show\.newSong'\)\.float\)/.test(fadesSrc) &&
    /randomLook\(activePresetId, stream\('phone\.look'\)\.float\)/.test(appSrc) &&
    !/\.pick\(pool\)/.test(fadesSrc + appSrc + sharedSrc));

  /*
    The opening look is drawn from the show's seeded stream now (lib/rng.ts,
    `npm run seed`), not from Math.random, so a render opens on the look it
    opened on before. What this held — that a visitor does not arrive on the
    same look every time — is held the same way, with one more link: the pick
    is from the pool, and the seed it is keyed on is drawn fresh each load
    (crypto) unless ?seed= fixes it. Moved here from panel.mjs with PLAN 45a-13,
    when the pick became pickLook's.
  */
  const rngSource = readFileSync('src/lib/rng.ts', 'utf8');
  check('the opening look is not always the same one',
    /export const OPENING_LOOK/.test(sharedSrc) && /pickLook\(PRESETS, stream\('show\.opening'\)\.float/.test(sharedSrc)
      && /current = asked \?\? drawStartupSeed\(\)/.test(rngSource) && /getRandomValues\(new Uint32Array\(1\)\)/.test(rngSource));
  check('and can be pinned so a harness is not random', /get\('look'\)/.test(sharedSrc));

  // And no other picker of a look has grown up beside it: no file that reads
  // PRESETS draws from a stream's pick() or Math.random.
  const strays = [];
  const walk = (dir) => { for (const f of readdirSync(dir)) {
    const path = join(dir, f);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx?$/.test(f) && !path.endsWith('lookPick.ts')) {
      const src = readFileSync(path, 'utf8');
      if (/\bPRESETS\b/.test(src) && /\.pick\(|Math\.random\(\)/.test(src)) strays.push(path);
    }
  } };
  walk('src');
  check('no file that reads the shipped looks picks one at random but pickLook', strays.length === 0, strays.join(', ') || 'none');
}
