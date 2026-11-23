/**
 * No film of a build that draws the flower (PLAN 31s-8).
 *
 * The owner, 2026-11-22: nothing showing the flower goes on YouTube or the
 * website. Films were made, and published, of builds that still drew it,
 * because nothing between the build and the recorder looked. So every
 * harness that records the plate for anyone to see asks here first, and
 * refuses to record a build that fails.
 *
 * Three questions, because the flower got through each gap once:
 *
 *   1. Does the source draw it? `npm run flower` in full, its point-read
 *      control included, so a measure gone blind fails rather than passes.
 *      Once a process; it has ten minutes, then counts as failed.
 *   2. Is the build being served the source? film.mjs and showreel.mjs serve
 *      whatever `dist/` holds, built an hour or a week ago: the owner saw the
 *      flower on a local server serving an old build, while main had the fix.
 *      `dist` names the folder served, and its scripts must carry the fixed
 *      slope (`fn cellDensity`).
 *   3. Is the page being filmed running it? `page` asks the open page itself,
 *      whatever served it (a dev server, a preview, the site), for the
 *      scripts it loaded, and looks for the same function in them.
 *
 * The marker is a function the fix added, so this proves the build is not
 * the one before the fix; whether the fix draws no flower is question 1's.
 *
 * `FILM_ALLOW_FLOWER=1` films anyway, for a private take of the fault itself
 * (a before for a fix): the take is flagged in the log, never quietly let
 * through.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = 'fn cellDensity';
const LIMIT_MS = 10 * 60_000;
let verdict = null;

/**
 * Rejects if this build draws the flower, unless FILM_ALLOW_FLOWER=1. `dist`: the folder a harness
 * serves; `page`: a page already open on the app. Asynchronous, so a page already open keeps its event
 * loop while the lab runs beside it; the source's answer is kept for the rest of the process.
 */
export async function untilFlowerFree({ log = console.log, dist = null, page = null } = {}) {
  if (!verdict) verdict = check();
  const v = await verdict;
  const why = [];
  if (!v.ok) why.push(`the source draws the flower (npm run flower): ${v.lines.join(' | ') || 'the check failed to run'}`);
  if (dist) {
    const d = distHasFix(dist);
    if (!d.ok) why.push(`the build served from ${dist} is older than the fix: ${d.why}; build it again (npm run build)`);
  }
  if (page) {
    const p = await pageHasFix(page);
    if (!p.ok) why.push(`the page at ${page.url()} runs a build older than the fix: ${p.why}`);
  }
  if (!why.length) return;
  if (process.env.FILM_ALLOW_FLOWER === '1') {
    log(` !!  FLOWER: ${why.join('; ')}. Filming anyway (FILM_ALLOW_FLOWER=1): a private take only, never for YouTube or the site.`);
    return;
  }
  throw new Error(`not recording: ${why.join('; ')}. FILM_ALLOW_FLOWER=1 films it anyway, for a private take only.`);
}

export function distHasFix(dist) {
  const assets = path.join(dist, 'assets');
  if (!fs.existsSync(assets)) return { ok: false, why: `no ${assets}` };
  const js = fs.readdirSync(assets).filter((f) => f.endsWith('.js'));
  if (!js.length) return { ok: false, why: `no scripts in ${assets}` };
  const has = js.some((f) => fs.readFileSync(path.join(assets, f), 'utf8').includes(MARKER));
  return has ? { ok: true } : { ok: false, why: `none of its ${js.length} scripts has "${MARKER}"` };
}

export async function pageHasFix(page) {
  try {
    const r = await page.evaluate(async (marker) => {
      // Every script the page loaded, the module graph included (a dev server serves each file apart).
      const urls = new Set(performance.getEntriesByType('resource').map((e) => e.name)
        .filter((u) => /\.(m?js|ts|tsx)(\?|$)/.test(u) || u.includes('/assets/')));
      for (const s of document.scripts) if (s.src) urls.add(s.src);
      let read = 0;
      for (const u of urls) {
        try {
          const t = await (await fetch(u)).text();
          read++;
          if (t.includes(marker)) return { ok: true, read };
        } catch { /* a script that will not refetch says nothing either way */ }
      }
      return { ok: false, read };
    }, MARKER);
    return r.ok ? { ok: true } : { ok: false, why: `none of the ${r.read} scripts it loaded has "${MARKER}"` };
  } catch (e) {
    return { ok: false, why: `could not read its scripts (${String(e.message ?? e).slice(0, 120)})` };
  }
}

// The check's own process inherits CG_FILM_LOCK_HELD, so it never queues behind the harness that asked (scripts/maclock.mjs).
function check() {
  return new Promise((resolve) => {
    // The bundled harnesses run from node_modules/.cache, so the check is found from the repo root.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const root = here.includes(`${path.sep}node_modules${path.sep}`) ? here.slice(0, here.indexOf(`${path.sep}node_modules${path.sep}`)) : path.resolve(here, '..');
    let out = '';
    const p = spawn(process.execPath, [path.join(root, 'scripts', 'flower.mjs')], { cwd: root });
    const kill = setTimeout(() => { out += `\nFAIL the flower check ran past ${LIMIT_MS / 60_000} minutes and was stopped`; p.kill('SIGKILL'); }, LIMIT_MS);
    p.stdout.on('data', (b) => { out += b; });
    p.stderr.on('data', (b) => { out += b; });
    p.on('error', () => { clearTimeout(kill); resolve({ ok: false, lines: [] }); });
    p.on('close', (code) => { clearTimeout(kill); resolve({ ok: code === 0, lines: out.split('\n').filter((l) => /FAIL|error/i.test(l)).slice(0, 6) }); });
  });
}
