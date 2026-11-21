#!/usr/bin/env node
/**
 * The music's hands as cords (PLAN 38v-1; `npm run musiccords`, node only,
 * about a second).
 *
 * Until 2026-11-21 the frame loop played the music with a block of hands of
 * its own (a pulse of dye and heat, the glass pressed, a bloom and a dose on
 * every kick, a stream on the mids, sparks on the treble, a swell on the
 * energy), under Sound Drive and on no patch bay. They are cords now
 * (lib/musicCords.ts), played by the hands (lib/areaCords.ts). This holds:
 *
 *  1. The block is gone: the loop calls none of its hands' code (the bloom's
 *     thrower, the hands' scale, the press's depth) and reads no route of
 *     `audioMappings` but the plate spin's.
 *  2. Pulled cords lay nothing: every look's cords with its music's ones
 *     taken out, played by the real hands under loud music and kicks, lay no
 *     dye, heat, drop, dose or press more than under silence; with them in,
 *     loud music lays dye and silence lays none.
 *  3. As hard as the block: each hand's cord, laid on a plate look (Classic)
 *     and played at a fixed reading at Sound Drive's 1x, pours within a
 *     tenth of what the block's own arithmetic poured a second (the pulse,
 *     the stream, the swell), a kick within a tenth of the bloom's dye, and
 *     the press asks the depth the bass's hand did at its ceiling.
 *  4. Harder: Sound Drive at 1 pours 2.2x its 0.45 (musicHands), and each
 *     cord turned to depth 1 pours twice its laid 0.5, so a hand can go past
 *     the block's reach.
 *  5. Every look the music plays carries its hands, by its own wiring: a
 *     pulse and its heat where its Density route reads something, a press
 *     where Velocity does, the bloom, the stream, the swell, a bottle where
 *     Color does, in every area they pour in; each rides Sound Drive; on a
 *     look with Sound Drive at 0 (Lava Lamp) they are laid and silent, and
 *     pour once it is turned up. A look saved before gains them once, and a
 *     sanitised look keeps them, fields and all.
 *  6. (In 5's block.) 7. A master turned down shrinks each kick's bloom:
 *     at Kick Bloom 0.2, Sound Drive 0.1 or a breakdown's passage of 0.4,
 *     every kick still lets a slug go, and at Kick Bloom 0.2 it is a fifth
 *     of the size. With the masters inside the reading the gate compared
 *     them against its 0.3 threshold, and Kick Bloom under about 0.3 let no
 *     kick through (the review of 38v-1).
 */
import { readFileSync } from 'node:fs';
import { AreaHands, plateArea, PRESS_DEPTH } from '../src/lib/areaCords.ts';
import { cordReading } from '../src/lib/sceneMap.ts';
import { isMusicCord, setMasters, withMusicCordsOnce, musicCordsFor, NEW_LOOK } from '../src/lib/musicCords.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { PRESETS } from '../src/presets.ts';
import { PRESET_AREAS, areaFamily } from '../src/lib/plateAreas.ts';
import { BASS_PRESS } from '../src/lib/squish.ts';
import { sanitizePatch } from '../src/lib/sanitizeSettings.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : String(x));

const LOUD = { bass: 90, mid: 85, treble: 80, volume: 90, energy: 0.8, timbre: 60, complexity: 60, features: { bands: new Array(8).fill(0.8) } };
const QUIET = { bass: 0, mid: 0, treble: 0, volume: 0, energy: 0, timbre: 0, complexity: 0, features: { bands: new Array(8).fill(0) } };

/**
 * Play `cords` on the real hands for `seconds` at sixty steps a second: the
 * sound `sound`, a kick hit of `kick` every half second (0 for none), Sound
 * Drive `drive` at the passage's loudness `passage`, Kick Bloom `bloom`.
 * Returns what reached the sink, and how many kicks let a slug go (`slugs`).
 */
function play(cords, { sound = LOUD, kick = 0.8, drive = 0.45, seconds = 4, areas = null, dyes = 5, bloom = 1, passage = 1 } = {}) {
  const hands = new AreaHands();
  const plate = plateArea(dyes);
  const got = { dye: 0, drop: 0, slug: 0, heat: 0, paddle: 0, liquid: 0, dose: 0, press: 0, slugs: 0 };
  let slugStep = false;
  const sink = {
    heat(x, y, k) { got.heat += Math.abs(k); },
    dye(x, y, a) { got.dye += a; },
    paddle() { got.paddle++; },
    liquid() { got.liquid++; },
    drop(x, y, a, c, slug) { if (slug) { got.slug += a; slugStep = true; } else got.drop += a; },
    dose() { got.dose++; },
  };
  const masters = setMasters({}, { audioImpact: drive, kickBloom: bloom }, { passage });
  let n = 0;
  for (let step = 0; step < seconds * 60; step++) {
    const v = kick > 0 && step % 30 < 3 ? kick : 0;
    const ctx = { sound, shape: null, room: null, film: null, hits: { value: (f) => (f === 'kickHit' || f === 'anyHit' ? v : 0) }, roomImpact: 0, filmImpact: 0, soundImpact: 1, shapeImpact: 1, masters };
    hands.step(cords, areas, (m, band) => cordReading(ctx, m, 0, band), 1 / 60, plate, masters);
    slugStep = false;
    hands.lay(sink, 192, 1 / 60, () => ({ r: 1, g: 1, b: 1 }), 0, { pace: 1, dice: () => ((n = (n + 0.618034) % 1)), plate });
    if (slugStep) got.slugs++;
    if (hands.pressAt) got.press = Math.max(got.press, hands.pressAt.depth);
  }
  return got;
}
const total = (g) => g.dye + g.drop + g.slug + g.heat + g.liquid + g.dose + g.press + g.paddle;

// ── 1. The block is gone ──
{
  const vis = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
  const gone = ['throwKickBloom(', 'musicHands(', 'bassPressFor(', 'audioMappings.density', 'audioMappings.velocity', 'audioMappings.color', 'treble01 * 1.1'];
  const left = gone.filter(s => vis.includes(s));
  check('the frame loop has none of the music\'s own hands (bloom, scale, press depth, the three routes, sparks)', left.length === 0, left.join(', ') || 'none left');
}

// ── 2. Pulled cords lay nothing ──
{
  const loudOver = [];
  let looks = 0;
  for (const p of PRESETS) {
    const all = p.settings.sceneMappings ?? [];
    if (!all.some(isMusicCord)) continue;
    looks++;
    // Only the hands: the setting cords (the look's answers to the drums, the stir) are folded by the bay, not laid here.
    const pulled = all.filter(m => !isMusicCord(m));
    const areas = PRESET_AREAS[p.id] ?? null;
    const loud = play(pulled, { areas }), quiet = play(pulled, { sound: QUIET, kick: 0, areas });
    const wired = play(all, { areas }), still = play(all, { sound: QUIET, kick: 0, areas });
    // The look's own drum cords may lay in its areas; the music's hands are what must be gone. So: the pulled set lays nothing on the plate.
    const plateOnly = pulled.filter(m => m.area === undefined);
    const plateLoud = total(play(plateOnly, { areas }));
    if (plateLoud > 0 || total(quiet) > 0 || !(total(wired) > total(loud)) || total(still) > 0) loudOver.push(`${p.id} ${f3(plateLoud)} ${f3(total(wired))}/${f3(total(loud))} ${f3(total(still))}`);
  }
  check('with the music\'s cords pulled, loud music and kicks lay nothing on the plate; with them in it lays more, and silence nothing',
    looks >= 30 && loudOver.length === 0, loudOver.join('; ') || `${looks} looks`);
}

// ── 3. As hard as the block ──
{
  const classic = PRESETS.find(p => p.id === 'classic').settings;
  const cords = classic.sceneMappings.filter(isMusicCord);
  const role = (r) => cords.filter(m => m.role === r);
  const per = (g, s) => (g.drop + g.slug) / s;
  // The block a second, at sixty steps, pace and room 1, Sound Drive 1x: 60 × its per-step rate × the reading.
  const S = 4;
  const pulse = per(play(role('pulse'), { kick: 0, seconds: S }), S), pulseOld = 60 * 0.025 * Math.min(1, LOUD.volume / 100);
  const stream = per(play(role('stream'), { kick: 0, seconds: S }), S), streamOld = 60 * 0.06 * Math.min(1, LOUD.mid / 70);
  const swell = per(play(role('swell'), { kick: 0, seconds: S }), S), swellOld = 60 * 0.06 * LOUD.energy;
  // The bloom: 5 to 11 droplets, a third to one and a half of the hit each: 8 × 0.915 × the hit a kick, on average (lib/kickBloom.ts).
  const K = 200;
  const bloom = play(role('bloom'), { sound: QUIET, kick: 0.8, seconds: K / 2 }).slug / K, bloomOld = 8 * 0.915 * 0.8;
  const press = play(role('press'), { sound: { ...LOUD, bass: 100 }, kick: 0 }).press, pressOld = BASS_PRESS;
  const near = (a, b) => Math.abs(a / b - 1) < 0.1;
  check('each hand\'s cord at Sound Drive\'s 1x pours what the block did, within a tenth (pulse, stream, swell, a kick\'s bloom) and presses as deep',
    near(pulse, pulseOld) && near(stream, streamOld) && near(swell, swellOld) && near(bloom, bloomOld) && near(press, pressOld),
    `pulse ${f3(pulse)}/${f3(pulseOld)}, stream ${f3(stream)}/${f3(streamOld)}, swell ${f3(swell)}/${f3(swellOld)}, bloom ${f3(bloom)}/${f3(bloomOld)}, press ${f3(press)}/${f3(pressOld)}`);

  // ── 4. Harder ──
  const at = (drive) => play(cords, { drive, seconds: 2 });
  const lo = at(0.45), hi = at(1);
  const deep = play(cords.map(m => (m.role === 'bottle' ? m : { ...m, depth: 1 })), { seconds: 2 });
  const sum = (g) => g.drop + g.slug;
  check('Sound Drive at 1 pours 2.2x its 0.45 and every cord at depth 1 twice its laid depth, and presses deeper',
    Math.abs(sum(hi) / sum(lo) - 1 / 0.45) < 0.05 && Math.abs(sum(deep) / sum(lo) - 2) < 0.05 && deep.press > lo.press * 1.9 && PRESS_DEPTH === 2 * BASS_PRESS,
    `x${f3(sum(hi) / sum(lo))} at Sound Drive 1, x${f3(sum(deep) / sum(lo))} at depth 1, press ${f3(deep.press)} against ${f3(lo.press)}`);
}

// ── 5. Every look carries its hands ──
{
  const bad = [];
  let looks = 0, none = 0;
  for (const p of PRESETS) {
    const s = p.settings, maps = s.sceneMappings ?? [];
    const music = maps.filter(isMusicCord);
    // Laid whatever Sound Drive is (38v-1): at 0 they are there to turn up, and silent.
    if (!((s.audioImpact ?? 0.45) > 0.01)) {
      none++;
      const quiet = total(play(music, { drive: s.audioImpact ?? 0, areas: PRESET_AREAS[p.id] ?? null, seconds: 1 }));
      const up = total(play(music, { drive: 0.45, areas: PRESET_AREAS[p.id] ?? null, seconds: 1 }));
      if (!music.some(m => m.role === 'pulse' || m.role === 'stream') || quiet > 0 || !(up > 0)) bad.push(`${p.id} at Sound Drive 0: ${music.length} cords, ${f3(quiet)} laid, ${f3(up)} turned up`);
      continue;
    }
    looks++;
    const am = s.audioMappings ?? {};
    const has = (r) => music.some(m => m.role === r);
    const want = { pulse: (am.density ?? 'bass') !== 'none', heat: (am.density ?? 'bass') !== 'none', press: (am.velocity ?? 'bass') !== 'none', bloom: true, stream: true, swell: true, bottle: (am.color ?? 'treble') !== 'none' };
    for (const [r, w] of Object.entries(want)) if (has(r) !== w) bad.push(`${p.id} ${r} ${has(r) ? 'present' : 'missing'}`);
    if (!music.filter(m => m.role !== 'bottle').every(m => m.masters?.includes('audioImpact'))) bad.push(`${p.id}: a hand off Sound Drive`);
    if (maps.length > 32) bad.push(`${p.id}: ${maps.length} cords, over the 32 a saved look keeps`);
    /*
      On a look with areas the Color route turns the bottle in every area the
      music pours in that has a choice of bottles: played by the real hands,
      quiet treble picks the first and loud another, through the one
      whole-plate Bottle cord (AreaHands.picked), unless the area has a
      Bottle cord of its own (Poster's note).
    */
    const areas = PRESET_AREAS[p.id];
    if (areas && want.bottle) {
      const hue = music.filter(m => m.role === 'bottle');
      const own = new Set(maps.filter(m => m.setting === 'areaHue' && m.area !== undefined).map(m => m.area));
      const pours = [...new Set(music.filter(m => m.setting === 'areaPour' && m.area !== undefined).map(m => m.area))]
        .filter(a => areaFamily(areas[a]).length > 1 && !own.has(a));
      const pick = (level) => { const h = new AreaHands(); h.step(hue, areas, () => level, 1 / 60, plateArea(5)); return pours.map(a => h.picked(a, areas[a])); };
      const lo = pick(0.02), hi = pick(1);
      pours.forEach((a, i) => { if (!(lo[i] === 0 && hi[i] > 0)) bad.push(`${p.id} area ${a}: bottle ${lo[i]} quiet, ${hi[i]} loud`); });
    }
  }
  check('every look carries its hands by its own wiring, each on Sound Drive, a bottle in each area they pour in; silent where Sound Drive is 0, and there to turn up',
    looks >= 30 && none >= 1 && bad.length === 0, bad.join('; ') || `${looks} looks, ${none} at 0`);

  const old = { audioImpact: 0.6, audioMappings: { velocity: 'bass', density: 'mid', color: 'none', rotation: 'none' }, sceneMappings: [{ source: 'sound', feature: 'mid', setting: 'turbulenceScale', depth: 0.3 }] };
  const once = withMusicCordsOnce(old), twice = withMusicCordsOnce(once);
  const kept = sanitizePatch({ sceneMappings: musicCordsFor(PRESETS.find(p => p.id === 'classic').settings, null) }).sceneMappings ?? [];
  const sent = musicCordsFor(PRESETS.find(p => p.id === 'classic').settings, null);
  check('a look saved before gains its hands once, and a sanitised look keeps every hand and its fields',
    once.sceneMappings.length === 1 + musicCordsFor(old, null).length && twice.sceneMappings.length === once.sceneMappings.length
      && kept.length === sent.length && JSON.stringify(kept) === JSON.stringify(sent),
    `${old.sceneMappings.length} → ${once.sceneMappings.length} → ${twice.sceneMappings.length}; sanitised ${kept.length} of ${sent.length}`);
}

// ── 6b. New Look starts from the defaults with the music's hands (App.tsx newLook; `npm run panel` reads that it uses NEW_LOOK) ──
{
  const { sceneMappings: got, ...rest } = NEW_LOOK, { sceneMappings: _d, ...base } = DEFAULT_SETTINGS;
  const want = musicCordsFor(DEFAULT_SETTINGS, null);
  check('a new look is the defaults with the music\'s hands on them, and nothing else changed',
    JSON.stringify(rest) === JSON.stringify(base) && want.length >= 6 && JSON.stringify(got) === JSON.stringify([...(DEFAULT_SETTINGS.sceneMappings ?? []), ...want]),
    `${got?.length ?? 0} cords, ${want.length} the music's`);
}

// ── 7. A master turned down shrinks each kick's bloom; it never lifts the gate over the kicks ──
{
  const bloomCord = PRESETS.find(p => p.id === 'classic').settings.sceneMappings.filter(m => m.role === 'bloom');
  const K = 40, S = K / 2;
  const full = play(bloomCord, { sound: QUIET, seconds: S }), low = play(bloomCord, { sound: QUIET, seconds: S, bloom: 0.2 });
  const soft = play(bloomCord, { sound: QUIET, seconds: S, drive: 0.1 }), lull = play(bloomCord, { sound: QUIET, seconds: S, passage: 0.4 });
  const ratio = low.slug / full.slug;
  check('at Kick Bloom 0.2, Sound Drive 0.1 or a breakdown every kick still blooms, Kick Bloom 0.2 a fifth as big',
    full.slugs === K && low.slugs === K && soft.slugs === K && lull.slugs === K && Math.abs(ratio - 0.2) < 0.02,
    `kicks that bloomed ${full.slugs}, ${low.slugs}, ${soft.slugs}, ${lull.slugs} of ${K}; x${f3(ratio)} at 0.2`);
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
