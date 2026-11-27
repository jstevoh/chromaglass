/**
 * The projector bank at the Mixer's top (PLAN 51a, components/ProjectorBank.tsx),
 * for `npm run panel`'s "nothing in the registry is invisible" line, kept
 * beside panel.mjs, which is over its size budget.
 *
 * Each lamp and the crossfade is a slider, each shutter a button, drawn by
 * the Mixer wherever it is, so they count as drawn only when the Mixer's own
 * chain holds (`mixerOk`), the Mixer draws the bank with its chips, the bank
 * takes its range from the registry and offers the chips; the keys are the
 * ones the bank's file names. Returns them, or none when a link is missing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function bankDrawn(root, mixerSrc, mixerOk, check) {
  const bankSrc = readFileSync(join(root, 'src/components/ProjectorBank.tsx'), 'utf8');
  const links = {
    'the Mixer draws the bank, with its chips': /<ProjectorBank\b[^>]*chips=\{chips\}/.test(mixerSrc),
    'at the registry\'s range': /PIN_RANGE\.get\(k\)/.test(bankSrc) && /min=\{spec\.min\}/.test(bankSrc) && /max=\{spec\.max\}/.test(bankSrc),
    'offering the chips beside each slider': /chips\(k\)/.test(bankSrc),
  };
  const keys = [...bankSrc.matchAll(/(?:slider|shutter)\('(proj[A-Za-z]+)'/g)].map(m => m[1]);
  const broken = Object.entries(links).filter(([, ok]) => !ok).map(([k]) => k);
  const ok = broken.length === 0 && mixerOk && keys.length === 5;
  check('and the projector bank at its top, from the registry', ok,
    broken.length ? `missing: ${broken.join('; ')}` : mixerOk ? keys.join(', ') : 'the Mixer\'s own chain is broken');
  return ok ? keys : [];
}
