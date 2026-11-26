#!/usr/bin/env node
/**
 * Render one 240×150 WebP plate still per shipped look into `public/looks/<id>.webp`
 * using the lab's real solver and real plate shader (PLAN 34b-1).
 *
 *   npm run lookstills
 *   npm run lookstills -- --only classic,saffron-lace
 *
 * Removes any stale `.webp` in `public/looks/` whose id is no longer in `PRESETS`.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openLab } from './lab.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT_DIR = join(ROOT, 'public/looks');
const WIDTH = 240;
const HEIGHT = 150;
const MAX_BYTES = 20_000;

const onlyFlag = process.argv.find((a) => a.startsWith('--only='));
const onlyArg = onlyFlag
  ? onlyFlag.slice('--only='.length)
  : (() => {
      const i = process.argv.indexOf('--only');
      return i > 0 ? process.argv[i + 1] : null;
    })();
const ONLY = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim()).filter(Boolean)) : null;

mkdirSync(OUT_DIR, { recursive: true });

const { page, close } = await openLab({ entry: 'scripts/lookstills-entry.ts' });
try {
  const allIds = await page.evaluate(() => window.lookStills.lookIds());
  const expected = new Set(allIds);
  const targets = ONLY ? allIds.filter((id) => ONLY.has(id)) : allIds;

  if (!ONLY && existsSync(OUT_DIR)) {
    for (const file of readdirSync(OUT_DIR)) {
      if (!file.endsWith('.webp')) continue;
      const id = file.slice(0, -'.webp'.length);
      if (!expected.has(id)) {
        rmSync(join(OUT_DIR, file));
        console.log(`  removed stale still: public/looks/${file}`);
      }
    }
  }

  let minBytes = Infinity;
  let maxBytes = 0;
  for (const id of targets) {
    const res = await page.evaluate(
      ({ id, width, height, maxBytes }) =>
        window.lookStills.renderLook(id, { width, height, maxBytes: maxBytes - 500 }),
      { id, width: WIDTH, height: HEIGHT, maxBytes },
    );
    const buf = Buffer.from(res.bytes, 'base64');
    if (buf.length > MAX_BYTES) {
      throw new Error(`${id}.webp is ${buf.length} bytes, over ${MAX_BYTES}`);
    }
    writeFileSync(join(OUT_DIR, `${id}.webp`), buf);
    minBytes = Math.min(minBytes, buf.length);
    maxBytes = Math.max(maxBytes, buf.length);
    console.log(`  ${id.padEnd(22)} ${res.width}x${res.height}  ${String(buf.length).padStart(6)} B  q=${res.quality}`);
  }

  console.log(`\nok   rendered ${targets.length} look stills (${WIDTH}x${HEIGHT} WebP, ${minBytes}–${maxBytes} bytes)`);
} finally {
  await close();
}
