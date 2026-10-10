#!/usr/bin/env node
/**
 * Does sanitizePatch preserve DEFAULT_SETTINGS and every built-in preset without
 * dropping or altering any setting, while rejecting malformed inputs?
 *
 *   npm run sanitize
 *
 * PLAN.md §14n: One sanitizePatch against the settings registry used by the
 * socket, the MIDI map loader and a loaded look alike.
 */
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { PRESETS } from '../src/presets.ts';
import { sanitizePatch } from '../src/lib/sanitizeSettings.ts';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// 1. DEFAULT_SETTINGS
{
  const clean = sanitizePatch(DEFAULT_SETTINGS);
  const dropped = [];
  const altered = [];
  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(key in clean)) {
      dropped.push(key);
    } else if (JSON.stringify(clean[key]) !== JSON.stringify(val)) {
      altered.push(`${key}: ${JSON.stringify(clean[key])} !== ${JSON.stringify(val)}`);
    }
  }
  const ok = dropped.length === 0 && altered.length === 0;
  check('sanitizePatch preserves all DEFAULT_SETTINGS', ok,
    ok ? `${Object.keys(DEFAULT_SETTINGS).length} settings preserved` : `dropped: [${dropped.join(', ')}], altered: [${altered.join(', ')}]`);
}

// 2. Built-in presets
{
  let droppedCount = 0;
  let alteredCount = 0;
  const issues = [];

  for (const preset of PRESETS) {
    const clean = sanitizePatch(preset.settings);
    for (const [key, val] of Object.entries(preset.settings)) {
      if (!(key in clean)) {
        droppedCount++;
        issues.push(`${preset.id}.${key} dropped`);
      } else if (JSON.stringify(clean[key]) !== JSON.stringify(val)) {
        alteredCount++;
        issues.push(`${preset.id}.${key} altered (${JSON.stringify(clean[key])} vs ${JSON.stringify(val)})`);
      }
    }
  }

  const ok = droppedCount === 0 && alteredCount === 0;
  check(`sanitizePatch preserves all ${PRESETS.length} built-in presets without dropping or altering settings`, ok,
    ok ? `${PRESETS.length} presets clean` : `${issues.length} issues in presets: ${issues.slice(0, 10).join(', ')}${issues.length > 10 ? ` (+${issues.length - 10} more)` : ''}`);
}

// 3. Security guards (PLAN §14n)
{
  // Drops unknown keys
  const unknownKey = sanitizePatch({ notARealKeyAtAll: 123, globalSpeed: 0.05 });
  check('unknown keys are dropped', !('notARealKeyAtAll' in unknownKey) && unknownKey.globalSpeed === 0.05);

  // Prototype pollution attempt
  const protoAttempt = sanitizePatch(JSON.parse('{"__proto__":{"polluted":true},"globalSpeed":0.05}'));
  check('prototype pollution is prevented', !('polluted' in Object.prototype) && protoAttempt.globalSpeed === 0.05);

  // Non-finite numbers (NaN, Infinity, -Infinity)
  const nonFinite = sanitizePatch({ globalSpeed: NaN, zoom: Infinity, boundaryContrast: -Infinity, surge: 0.5 });
  check('non-finite numbers are dropped', !('globalSpeed' in nonFinite) && !('zoom' in nonFinite) && !('boundaryContrast' in nonFinite) && nonFinite.surge === 0.5);

  // Clamps finite numbers to valid range
  const clamped = sanitizePatch({ globalSpeed: 99999, surge: -100 });
  check('out-of-range numbers are clamped', clamped.globalSpeed === 0.3 && clamped.surge === 0);

  // Rejects invalid enums
  const badEnums = sanitizePatch({ blendMode: 'invalidBlend', ledMode: 'notAnLedMode', onNewSong: 'fakeMode', macroCamera: 'magicMode' });
  check('invalid enums are dropped', !('blendMode' in badEnums) && !('ledMode' in badEnums) && !('onNewSong' in badEnums) && !('macroCamera' in badEnums));

  // Valid enums survive
  const goodEnums = sanitizePatch({ blendMode: 'lighter', ledMode: 'cyberpunk', onNewSong: 'random', macroCamera: 'follow' });
  check('valid enums survive', goodEnums.blendMode === 'lighter' && goodEnums.ledMode === 'cyberpunk' && goodEnums.onNewSong === 'random' && goodEnums.macroCamera === 'follow');

  // Scene mappings validation
  const badMappings = sanitizePatch({
    sceneMappings: [
      { source: 'sound', feature: 'bass', setting: 'cometSpeed', depth: 0.4 }, // valid
      { source: 123, feature: 'bass', setting: 'cometSpeed', depth: 0.4 }, // invalid source type
      { source: 'sound', setting: 'cometSpeed', depth: 0.4 }, // missing feature
      { feature: 'bass', setting: 'cometSpeed', depth: 'notANumber' }, // invalid depth
    ]
  });
  check('malformed sceneMappings are filtered', Array.isArray(badMappings.sceneMappings) && badMappings.sceneMappings.length === 1 && badMappings.sceneMappings[0].setting === 'cometSpeed');
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
