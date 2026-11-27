/**
 * The parity run: main against a branch, every look and the bug bash's
 * sweep, compared number for number (PLAN.md 50i).
 *
 *   npm run parity                                  this tree against origin/main: every look, desk tabs 1 and 2
 *   npm run parity -- --base <ref> --head <ref>     any two commits (the head is swept in a worktree too)
 *   npm run parity -- --looks classic,roy --tabs 3 --phone
 *   npm run parity -- --tabs none --hours 2         only the looks, and stop starting work after two hours
 *   npm run parity -- --nightly                     what the Mac's nightly job runs (scripts/parity-nightly.sh)
 *   npm run parity -- install-agent                 on the owner's Mac: the nightly job, 11:30 PM local
 *   npm run parity -- uninstall-agent
 *   npm run parity -- --selftest                    the comparison on made-up runs (no browser)
 *
 * Asked for (the owner, 2026-11-27, PLAN §50: "Let's get all of these
 * going"). Thirty and more pull requests a day reach main, most of them
 * built by Antigravity and merged on green by the foreman, and each one's
 * checks ask one thing of one part. What nobody asks is the plain question
 * a port to a new system is held to: does the whole app still do what it did
 * yesterday? The bug bash (`npm run bugbash`, QA-33) already opens every
 * look and turns every control and reads the plate as numbers; on its own it
 * says what looks wrong today. Run twice, once on main and once on the
 * branch, the same sweep says what changed, which is the question a day's
 * merges raise: a look that lost a third of its frame rate, a dial that
 * stopped reaching the plate, a switch that no longer moves its settings, a
 * finding that is new.
 *
 * Numbers only, never pixels and never films (the owner, 2026-11-26: "Don't
 * film anything"). The plate is chaotic: two runs of one tree part in where
 * an eddy curls within seconds, so the comparison is of what the bug bash
 * already reads about the whole frame (brightness, colour, the commonest
 * colour's share, detail, cast, motion, frame rate) and of what each control
 * did (how many settings it moved, whether the page changed, how far the
 * plate moved in units of the look's own drift), and of the findings.
 *
 * One ruler for both sides. The sweep is always this tree's `bugbash.mjs`,
 * pointed at each side's own build (`BUGBASH_DIST`), so a change to the
 * sweep itself can never read as a change to the app. The trees are built
 * once each (`vite build`), the base in a worktree beside this one.
 *
 * The Mac comes first for deploys and one film at a time. The work is cut
 * into short pieces (six looks, one desk tab, the phone), and each piece is
 * one `maclock.mjs run`, so it queues FIFO on `~/cg-scratch/film.lock` and
 * waits while a deploy shard holds the Mac (19ah-9a); between pieces the
 * lock is let go, so a deploy that starts mid-run waits at most one piece
 * (about four minutes for looks, twenty-five for a desk tab) instead of the
 * whole night. The sides alternate which goes first, piece by piece, so the
 * Mac warming up through the night lands on both sides alike.
 *
 * The tolerances are set here, not by the owner and not by a builder, and
 * each night checks them. Before the comparison, four control looks are
 * swept twice on the base (the same tree, the same build): whatever that
 * moves is the night's noise, not anyone's change, and each tolerance is
 * raised to twice that spread when the night is noisier than it allows.
 * The fixed floors, and why each:
 *
 *   frame rate   8 fps and 15 %: the bug bash counts frames for half a
 *                second, so one dropped frame is 2 fps; a hitch a person
 *                feels at 60 is a drop of ten or more.
 *   brightness   0.04 of full: twice the bug bash's least change a person
 *                calls a change (0.02), because two runs of a chaotic plate
 *                are two different moments of it, not one moment twice.
 *   colours      0.06 of the frame with real colour in it; twice its 0.03.
 *   flat         0.08 of the frame in its commonest colour; a drained or
 *                one-sheet plate moves this by 0.3 to 0.6 (11-26's sweep).
 *   detail       0.006 of the mean gradient; 1.5 times its 0.004, the size
 *                of a blur a person sees on a plate at 160×100.
 *   cast         0.03: how far the mean colour leans off grey.
 *   motion       0.004 and half the base's: motion is the noisiest of the
 *                six, from 0.0005 (a still lamp) to 0.05 (a stirred plate).
 *
 * And a look is called changed only when both of its moments (as it opens,
 * and twenty seconds on) moved past the tolerance in the same direction: a
 * swirl that happened to be passing at one reading does not hold for twenty
 * seconds; a look that really got darker does. A control is called changed
 * only across a gap: it moved the plate three times its drift on one side
 * and under once on the other, so a control near the line does not flap
 * from night to night. Settings moved and the page changed are counts the
 * app either does or does not, and need no tolerance.
 *
 * Never a gate. It writes `parity.md` and `parity.json` into the run's
 * folder and exits 0 whatever it found, like the bug bash: a sweep this
 * wide meets every quirk of every panel, and a person (or the session that
 * reads the night's report) decides which differences are the change a
 * pull request meant and which are a regression. On the Mac the nightly
 * folder is `~/cg-scratch/parity/<date>/`, and `~/cg-scratch/parity/latest.md`
 * is the last night's report.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PRESETS } from '../src/presets.ts';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const arg = (name, fallback) => {
  const i = argv.lastIndexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const HOME_DIR = path.join(os.homedir(), 'cg-scratch', 'parity');

// ---------------------------------------------------------------- tolerances

export const TOL = {
  fps: { abs: 8, rel: 0.15 },
  luma: { abs: 0.04 }, colours: { abs: 0.06 }, flat: { abs: 0.08 },
  detail: { abs: 0.006 }, cast: { abs: 0.03 }, motion: { abs: 0.004, rel: 0.5 },
};
const PLATE = ['luma', 'colours', 'flat', 'detail', 'cast', 'motion'];
// A control's plate reading is in units of the look's drift: seen at 3, not seen under 1.
const SEEN = 3, UNSEEN = 1;
// One of each kind of plate (oil on water, a print drawn at the pixel, the ferrofluid, the film).
export const CONTROL_LOOKS = ['classic', 'roy', 'ferro-paint', 'soap-film'];
const RAISE_CAP = 3;
const SEV_RANK = { high: 0, med: 1, low: 2, info: 3 };

/** How far apart two numbers may be before they count, for one measure. */
export const allowed = (m, base, tol) => Math.max(tol[m].abs, (tol[m].rel ?? 0) * Math.abs(base ?? 0));

/**
 * Tonight's tolerances: the fixed floors, each raised to twice the spread the
 * same tree showed against itself on the control looks.
 */
export function tolerancesFrom(aa1, aa2) {
  const tol = structuredClone(TOL), spread = {}, raised = [];
  const a = byKey(aa1.readings), b = byKey(aa2.readings);
  for (const m of ['fps', ...PLATE]) spread[m] = 0;
  for (const [k, ra] of a) {
    const rb = b.get(k);
    if (!rb || ra.area !== 'Looks') continue;
    if (ra.fps != null && rb.fps != null) spread.fps = Math.max(spread.fps, Math.abs(ra.fps - rb.fps));
    for (const when of ['reading', 'later']) for (const m of PLATE) {
      const x = ra[when]?.[m], y = rb[when]?.[m];
      if (x != null && y != null) spread[m] = Math.max(spread[m], Math.abs(x - y));
    }
  }
  /*
    Raised, but never past three times the floor: one control look that
    opened black on its second run would otherwise lift brightness's
    tolerance to 0.6 and blind it for the night. Past the cap the measure is
    called too noisy to judge tonight, as a high line, not quietly ignored.
  */
  const noisy = [];
  for (const m of Object.keys(spread)) if (2 * spread[m] > tol[m].abs) {
    const to = Math.min(2 * spread[m], RAISE_CAP * TOL[m].abs);
    raised.push({ m, from: tol[m].abs, to });
    if (2 * spread[m] > to) noisy.push(m);
    tol[m].abs = to;
  }
  // Findings the same tree makes on one run and not the next are tonight's flakes, not a change.
  const fa = new Set(aa1.findings.map(findingKey)), fb = new Set(aa2.findings.map(findingKey));
  const flaky = [...fa].filter((k) => !fb.has(k)).concat([...fb].filter((k) => !fa.has(k)));
  return { tol, spread, raised, flaky, noisy };
}

const readingKey = (r) => `${r.area}|${r.control}|${r.look}`;
const findingKey = (f) => `${f.area}|${f.control}|${f.look}|${f.kind}`;
/*
  Two readings with one key (two phone buttons of one name open sheets whose
  controls share an area) would overwrite each other, and a regression in the
  first would vanish: the second and later are kept apart by their order,
  which is the same order on both sides of one sweep.
*/
const byKey = (rs) => {
  const out = new Map();
  for (const r of rs ?? []) { let k = readingKey(r), n = 1; while (out.has(k)) k = `${readingKey(r)}|${++n}`; out.set(k, r); }
  return out;
};
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const fmt = (v) => (v == null ? '–' : Math.abs(v) >= 10 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(3));

/**
 * Two sweeps compared: every difference past its tolerance, worst first.
 * `base` and `head` are `{ findings, coverage, readings }`, each the bug
 * bash's files of one side merged.
 */
export function compare(base, head, { tol = TOL, flaky = [], noisy = [] } = {}) {
  const rows = [];
  const add = (sev, area, control, look, what, b, h) => rows.push({ sev, area, control, look, what, base: b, head: h });
  const B = byKey(base.readings), H = byKey(head.readings);
  // A side that measured nothing is a failed run, never "nothing differs".
  if (!B.size || !H.size) add('high', 'Run', 'the sweep', '', `measured nothing on the ${!B.size && !H.size ? 'base or the branch' : !B.size ? 'base' : 'branch'}`, B.size, H.size);
  for (const m of noisy) add('high', 'Run', 'same-tree control', '', `${m} too noisy to judge tonight`, null, null);
  /*
    A number the base read and the branch did not (a frame the stage would
    not paint, a NaN, a field renamed) is the branch's plate going unread:
    the comparison below needs both, so without this line a branch that
    broke the readback would read as the same.
  */
  const unread = (rb, rh, k) => {
    const a = rb[k], b = rh[k];
    const has = (v) => (k === 'reading' || k === 'later' ? v && PLATE.every((m) => num(v[m])) : num(v));
    if (has(a) && !has(b)) add('high', rb.area, rb.control, rb.look, `${k === 'fps' ? 'frame rate' : k === 'plate' ? 'plate' : `plate (${k === 'later' ? '20 s on' : 'opening'})`} not read on the branch`, null, null);
    return has(a) && has(b);
  };

  for (const [k, rb] of B) {
    const rh = H.get(k);
    if (!rh) { add(rb.area === 'Looks' ? 'high' : 'med', rb.area, rb.control, rb.look, 'swept on the base, not on the branch', null, null); continue; }
    if (unread(rb, rh, 'fps')) {
      const d = rh.fps - rb.fps;
      if (Math.abs(d) > allowed('fps', rb.fps, tol)) add(d < 0 ? 'med' : 'info', rb.area, rb.control, rb.look, d < 0 ? 'slower' : 'faster', rb.fps, rh.fps);
    }
    const two = unread(rb, rh, 'later');
    if (unread(rb, rh, 'reading')) {
      for (const m of PLATE) {
        const d0 = rh.reading[m] - rb.reading[m];
        const d1 = two ? rh.later[m] - rb.later[m] : null;
        const past = (d, v, k = 1) => d != null && Math.abs(d) > k * allowed(m, v, tol);
        /*
          Both moments past the tolerance, the same way. A desk tab has one
          moment, and so does a look whose later reading neither side has:
          that one, at twice the tolerance, since one moment can be a swirl.
        */
        const held = two ? past(d0, rb.reading[m]) && past(d1, rb.later[m]) && Math.sign(d0) === Math.sign(d1)
          : past(d0, rb.reading[m], rb.area === 'Looks' ? 2 : 1);
        if (held) add('med', rb.area, rb.control, rb.look, `${m} ${d0 < 0 ? 'down' : 'up'}`, rb.reading[m], rh.reading[m]);
      }
    }
    if (rb.settings != null && rh.settings != null) {
      if (rb.settings > 0 && rh.settings === 0) add('med', rb.area, rb.control, rb.look, 'no longer moves any setting', rb.settings, rh.settings);
      else if (rb.settings === 0 && rh.settings > 0) add('info', rb.area, rb.control, rb.look, 'now moves settings', rb.settings, rh.settings);
      if (unread(rb, rh, 'plate')) {
        if (rb.plate >= SEEN && rh.plate < UNSEEN) add('med', rb.area, rb.control, rb.look, 'no longer shows on the plate', rb.plate, rh.plate);
        else if (rb.plate < UNSEEN && rh.plate >= SEEN) add('info', rb.area, rb.control, rb.look, 'now shows on the plate', rb.plate, rh.plate);
      }
      if (rb.dom > 0 && rh.dom === 0 && !rb.settings && !rh.settings) add('low', rb.area, rb.control, rb.look, 'no longer changes the page', rb.dom, rh.dom);
    }
  }
  for (const [k, rh] of H) if (!B.has(k)) add('info', rh.area, rh.control, rh.look, 'new on the branch', null, null);

  const skip = new Set(flaky);
  const fb = new Map(base.findings.map((f) => [findingKey(f), f])), fh = new Map(head.findings.map((f) => [findingKey(f), f]));
  for (const [k, f] of fh) if (!fb.has(k) && !skip.has(k)) add(f.sev, f.area, f.control, f.look, `new finding: ${f.kind}`, null, f.detail ?? '');
  for (const [k, f] of fb) if (!fh.has(k) && !skip.has(k) && H.has(readingKey(f))) add('info', f.area, f.control, f.look, `finding gone: ${f.kind}`, f.detail ?? '', null);

  rows.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev] || a.area.localeCompare(b.area) || a.control.localeCompare(b.control));
  return rows;
}

// ---------------------------------------------------------------- the report

export function report({ baseRef, headRef, merged, rows, night, covered, skipped, started, failed = [], unreadPlate = false }) {
  const n = { high: 0, med: 0, low: 0, info: 0 }; for (const r of rows) n[r.sev]++;
  const L = [];
  L.push(`# Parity: ${headRef} against ${baseRef}`, '');
  L.push(`${new Date(started).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT, ${Math.round((Date.now() - started) / 60000)} min. ` +
    `${n.high} high, ${n.med} medium, ${n.low} low, ${n.info} for information. Numbers only (PLAN 50i); never a gate.`, '');
  if (merged?.length) { L.push(`## What merged between them (${merged.length})`, '', ...merged.slice(0, 80).map((s) => `- ${s}`), ''); }
  L.push('## Tonight\'s tolerances', '', `The same tree swept twice on ${CONTROL_LOOKS.join(', ')}; a floor is raised to twice that spread when the spread passes it.`, '');
  L.push('| measure | floor | same tree spread | used |', '|---|---|---|---|');
  for (const m of ['fps', ...PLATE]) L.push(`| ${m} | ${fmt(TOL[m].abs)}${TOL[m].rel ? ` or ${TOL[m].rel * 100} %` : ''} | ${fmt(night?.spread?.[m])} | ${fmt(night?.tol?.[m].abs ?? TOL[m].abs)} |`);
  if (night?.flaky?.length) L.push('', `${night.flaky.length} findings came and went between the same tree's two runs and are left out: ${night.flaky.slice(0, 8).join('; ')}`);
  L.push('');
  const bySev = (s) => rows.filter((r) => r.sev === s);
  for (const [s, title] of [['high', 'High'], ['med', 'Medium'], ['low', 'Low'], ['info', 'For information (improvements, new controls, findings gone)']]) {
    const rs = bySev(s); if (!rs.length) continue;
    L.push(`## ${title} (${rs.length})`, '', '| area | control | look | what | base | branch |', '|---|---|---|---|---|---|');
    for (const r of rs.slice(0, 300)) {
      const cell = (v) => (typeof v === 'number' ? fmt(v) : String(v ?? '–').replace(/\|/g, '/').slice(0, 120));
      L.push(`| ${r.area} | ${r.control.replace(/\|/g, '/')} | ${r.look ?? ''} | ${r.what} | ${cell(r.base)} | ${cell(r.head)} |`);
    }
    L.push('');
  }
  if (!rows.length) L.push('Nothing differs past its tolerance.', '');
  if (unreadPlate) L.push('The plate was read on neither side (no WebGPU here): only settings, the page, frame rates and findings were compared.', '');
  if (failed?.length) L.push('## Pieces that failed', '', ...failed.map((f) => `- ${f}`), '');
  L.push('## Covered', '', ...covered.map((c) => `- ${c}`));
  if (skipped.length) L.push('', `Not reached in the time allowed: ${skipped.join(', ')}.`);
  return `${L.join('\n')}\n`;
}

// ---------------------------------------------------------------- trees and sweeps

/**
 * A built tree for a ref. The head, when it is HEAD, is this tree as it
 * stands (edits and all, as samelook compares); the base is always a
 * worktree beside it, so a dirty tree is compared against its own commit.
 */
function treeFor(ref, treesDir, { here = false } = {}) {
  const sha = git(ROOT, 'rev-parse', `${ref}^{commit}`);
  if (here && ref === 'HEAD') return { dir: ROOT, sha, here: true, clean: !git(ROOT, 'status', '--porcelain', '--untracked-files=no') };
  const dir = path.join(treesDir, sha.slice(0, 12));
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(treesDir, { recursive: true });
    try { git(ROOT, 'worktree', 'remove', '--force', dir); } catch { /* not one */ }
    git(ROOT, 'worktree', 'add', '--quiet', '--detach', dir, sha);
  }
  if (!fs.existsSync(path.join(dir, 'node_modules'))) fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  return { dir, sha, here: false };
}

function build(tree) {
  const stamp = path.join(tree.dir, 'dist', '.parity-built');
  if (!tree.here && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === tree.sha) return true;
  console.log(`  building ${tree.sha.slice(0, 9)} in ${tree.dir}`);
  const r = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'vite'), ['build', '--logLevel', 'warn'], { cwd: tree.dir, stdio: 'inherit' });
  if (r.status !== 0) return false;
  fs.writeFileSync(stamp, tree.sha);
  return true;
}

function bundleSweep() {
  const out = path.join(ROOT, 'node_modules', '.cache', 'bugbash-parity.mjs');
  execFileSync(path.join(ROOT, 'node_modules', '.bin', 'esbuild'), ['scripts/bugbash.mjs', '--bundle', '--platform=node', '--format=esm',
    '--log-level=warning', '--external:playwright', `--outfile=${out}`], { cwd: ROOT, stdio: 'inherit' });
  return out;
}

/** One piece on one side: the bug bash's part, through the Mac's film queue, and its files read back. */
function sweep(sweepJs, tree, piece, side, outDir) {
  const out = path.join(outDir, side, piece.name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const env = { ...process.env, BUGBASH_PART: piece.part, BUGBASH_DIST: path.join(tree.dir, 'dist'), BUGBASH_OUT: out };
  delete env.BUGBASH_LOOKS; delete env.BUGBASH_TABS;
  if (piece.looks) env.BUGBASH_LOOKS = piece.looks.join(',');
  if (piece.tabs) env.BUGBASH_TABS = piece.tabs.join(',');
  console.log(`\n  ── ${side}: ${piece.name} (${tree.sha.slice(0, 9)})`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'maclock.mjs'), 'run', '--label', `parity ${side} ${piece.name}`, '--timeout', '3600', '--',
    process.execPath, sweepJs], { cwd: ROOT, env, stdio: 'inherit' });
  return { ...readSweep(out), status: r.status };
}

/**
 * What is wrong with one reading's shape, or null. The bug bash writes these
 * (`readings.push` in scripts/bugbash.mjs); a field renamed there would
 * otherwise read here as a number neither side has, and compare as the same.
 */
export function shapeProblem(r) {
  const plate = (v) => v === null || (v && typeof v === 'object' && PLATE.every((m) => num(v[m])));
  if (!r || typeof r.area !== 'string' || typeof r.control !== 'string') return 'no area or control';
  if (r.area === 'Looks' || r.area === 'Desk') {
    if (!(r.fps === null || num(r.fps))) return `${r.control}: fps ${r.fps}`;
    if (!plate(r.reading)) return `${r.control}: reading ${JSON.stringify(r.reading)?.slice(0, 80)}`;
    if (r.area === 'Looks' && !plate(r.later)) return `${r.control}: later ${JSON.stringify(r.later)?.slice(0, 80)}`;
    return null;
  }
  if (!num(r.settings) || !num(r.dom) || !(r.plate === null || num(r.plate))) return `${r.control}: settings ${r.settings}, dom ${r.dom}, plate ${r.plate}`;
  return null;
}

export function readSweep(dir) {
  const got = { findings: [], coverage: [], readings: [], problems: [] };
  if (!fs.existsSync(dir)) return got;
  for (const n of fs.readdirSync(dir).filter((x) => /^findings-.*\.json$/.test(x))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
    for (const k of ['findings', 'coverage', 'readings']) got[k].push(...(j[k] ?? []));
    for (const r of j.readings ?? []) { const p = shapeProblem(r); if (p) got.problems.push(`${n}: ${p}`); }
  }
  return got;
}
const merge = (a, b) => ({ findings: [...a.findings, ...b.findings], coverage: [...a.coverage, ...b.coverage], readings: [...a.readings, ...b.readings] });

/** The pieces, in the order they run: short ones, so a deploy never waits long behind one. */
export function piecesFor({ looks, tabs, phone, batch = 6 }) {
  const out = [];
  for (let i = 0; i < looks.length; i += batch) out.push({ name: `looks-${i / batch + 1}`, part: 'looks', looks: looks.slice(i, i + batch) });
  for (const t of tabs) out.push({ name: `desk-tab-${t}`, part: 'desk', tabs: [t] });
  if (phone) out.push({ name: 'phone', part: 'phone' });
  return out;
}

/**
 * The nightly rotation: every look every night, and a quarter of the rest,
 * so the whole desk and the phone are compared every four nights in about
 * four hours a night on the Air (11-26's sweep took four hours for one side).
 */
export const NIGHTS = [{ tabs: [1, 2], phone: false }, { tabs: [3, 4], phone: false }, { tabs: [5, 6], phone: false }, { tabs: [7], phone: true }];
export const nightOf = (ms) => NIGHTS[Math.floor(ms / 86_400_000) % NIGHTS.length];

// ---------------------------------------------------------------- the run

async function run() {
  const started = Date.now();
  const nightly = has('nightly');
  const stateFile = path.join(HOME_DIR, 'last-main');
  let baseRef = arg('base', 'origin/main'), headRef = arg('head', 'HEAD');
  if (nightly) {
    // Yesterday's main against today's: the day's merges, each listed by its title.
    headRef = 'HEAD';
    const last = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8').trim() : '';
    const ok = last && spawnSync('git', ['merge-base', '--is-ancestor', last, 'HEAD'], { cwd: ROOT }).status === 0;
    baseRef = ok ? last : git(ROOT, 'rev-list', '-1', '--before=24 hours ago', 'HEAD') || 'HEAD~1';
  }
  const treesDir = path.join(nightly ? HOME_DIR : os.tmpdir(), 'parity-trees');
  const base = treeFor(baseRef, treesDir);
  const head = treeFor(headRef, treesDir, { here: true });
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const outDir = path.resolve(arg('out', nightly ? path.join(HOME_DIR, stamp) : path.join('scratch', 'parity')));
  fs.mkdirSync(outDir, { recursive: true });
  const merged = git(ROOT, 'log', '--first-parent', '--format=%h %s', `${base.sha}..${head.sha}`).split('\n').filter(Boolean);
  console.log(`\n  parity: ${head.sha.slice(0, 9)} against ${base.sha.slice(0, 9)}, ${merged.length} commits between; out ${outDir}`);
  if (base.sha === head.sha && (!head.here || head.clean)) {
    const text = `# Parity\n\nNothing merged since ${base.sha.slice(0, 9)}: no run.\n`;
    fs.writeFileSync(path.join(outDir, 'parity.md'), text);
    if (nightly) fs.writeFileSync(path.join(HOME_DIR, 'latest.md'), text);
    console.log('  nothing to compare'); return;
  }
  if (!build(base) || !build(head)) { console.error('  a tree did not build: no run'); process.exitCode = 2; return; }
  const sweepJs = bundleSweep();

  const night = nightOf(started);
  const tabsArg = arg('tabs', nightly ? night.tabs.join(',') : '1,2');
  const looks = list(arg('looks', '')).length ? list(arg('looks', '')) : PRESETS.map((p) => p.id);
  const tabs = tabsArg === 'none' ? [] : tabsArg === 'all' ? [1, 2, 3, 4, 5, 6, 7] : list(tabsArg).map(Number);
  const phone = has('phone') || (nightly && night.phone);
  const hours = Number(arg('hours', nightly ? 7 : Infinity));
  const pieces = piecesFor({ looks, tabs, phone });

  // The control: the base against itself, on four looks, before anything is compared.
  const ctl = { name: 'same-tree', part: 'looks', looks: CONTROL_LOOKS.filter((l) => PRESETS.some((p) => p.id === l)) };
  const aa1 = sweep(sweepJs, base, ctl, 'base', outDir), aa2 = sweep(sweepJs, base, ctl, 'base-again', outDir);
  const tonight = tolerancesFrom(aa1, aa2);

  const none = () => ({ findings: [], coverage: [], readings: [] });
  let B = none(), H = none();
  const covered = [], skipped = [], failed = [];
  for (const [n, aa] of [['', aa1], [' again', aa2]]) if (aa.status !== 0 || !aa.readings.length) failed.push(`same-tree control${n}: exit ${aa.status}, ${aa.readings.length} readings`);
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if ((Date.now() - started) / 3_600_000 > hours) { skipped.push(p.name); continue; }
    const order = i % 2 ? [['head', head], ['base', base]] : [['base', base], ['head', head]];
    for (const [side, tree] of order) {
      const got = sweep(sweepJs, tree, p, side, outDir);
      // A sweep that exited badly or read nothing is a failed piece: listed high, and the night is not marked done.
      if (got.status !== 0 || !got.readings.length || got.problems.length) failed.push(`${p.name} on the ${side}: exit ${got.status}, ${got.readings.length} readings${got.problems.length ? `, ${got.problems.length} misshapen (${got.problems[0]})` : ''}`);
      if (side === 'base') B = merge(B, got); else H = merge(H, got);
    }
    covered.push(`${p.name}${p.looks ? `: ${p.looks.join(', ')}` : ''}`);
  }

  const rows = compare(B, H, tonight);
  for (const f of failed) rows.unshift({ sev: 'high', area: 'Run', control: f, look: '', what: 'piece failed', base: null, head: null });
  const text = report({ baseRef: `${baseRef} (${base.sha.slice(0, 9)})`, headRef: `${headRef} (${head.sha.slice(0, 9)})${head.here ? ', this tree' : ''}`,
    merged, rows, night: tonight, covered, skipped, started, failed,
    unreadPlate: ![...B.readings, ...H.readings].some((r) => r.reading || num(r.plate)) });
  fs.writeFileSync(path.join(outDir, 'parity.md'), text);
  fs.writeFileSync(path.join(outDir, 'parity.json'), JSON.stringify({ base: base.sha, head: head.sha, merged, tolerances: tonight, rows, covered, skipped, failed }, null, 1));
  if (nightly) {
    fs.writeFileSync(path.join(HOME_DIR, 'latest.md'), text);
    if (!skipped.length && !failed.length) fs.writeFileSync(stateFile, head.sha);
    // Trees other than tonight's two are yesterday's; tonight's head is tomorrow's base.
    for (const d of fs.existsSync(treesDir) ? fs.readdirSync(treesDir) : []) {
      if (d !== head.sha.slice(0, 12) && d !== base.sha.slice(0, 12)) try { git(ROOT, 'worktree', 'remove', '--force', path.join(treesDir, d)); } catch { /* gone */ }
    }
  } else if (!base.here) {
    try { git(ROOT, 'worktree', 'remove', '--force', base.dir); } catch { /* gone */ }
  }
  const n = { high: 0, med: 0 }; for (const r of rows) if (r.sev in n) n[r.sev]++;
  console.log(`\n  ${path.join(outDir, 'parity.md')}: ${rows.length} differences (${n.high} high, ${n.med} medium)`);
}

// ---------------------------------------------------------------- the Mac's nightly job

const LABEL = 'art.chromaglass.parity';
const plistPath = () => path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

/**
 * The launchd agent. It runs `parity-nightly.sh` from its own clone
 * (`~/cg-scratch/parity/clone`), never from the owner's checkout, so the
 * nightly job never moves the branch a session is working on, and the
 * script it runs is always main's. 11:30 PM local: after the evening's
 * merges, before the morning's. A Mac asleep at 11:30 runs it when it wakes.
 */
export function plistText({ clone, node, hour = 23, minute = 30 }) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pathEnv = [path.dirname(node), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>-lc</string><string>${esc(`cd '${clone}' && git fetch -q origin main && git checkout -q --detach origin/main && exec bash scripts/parity-nightly.sh`)}</string></array>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${esc(pathEnv)}</string></dict>
<key>StartCalendarInterval</key><dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
<key>StandardOutPath</key><string>${esc(path.join(HOME_DIR, 'nightly.log'))}</string>
<key>StandardErrorPath</key><string>${esc(path.join(HOME_DIR, 'nightly.log'))}</string>
</dict></plist>
`;
}

function installAgent() {
  const clone = path.join(HOME_DIR, 'clone');
  fs.mkdirSync(HOME_DIR, { recursive: true });
  if (!fs.existsSync(path.join(clone, '.git'))) execFileSync('git', ['clone', '--quiet', git(ROOT, 'remote', 'get-url', 'origin'), clone], { stdio: 'inherit' });
  fs.mkdirSync(path.dirname(plistPath()), { recursive: true });
  fs.writeFileSync(plistPath(), plistText({ clone, node: process.execPath }));
  fs.writeFileSync(path.join(HOME_DIR, 'LIVE'), 'the parity run\'s nightly job is on; rm this file to turn it off\n');
  console.log(`  wrote ${plistPath()}`);
  if (process.env.PARITY_NO_LAUNCHCTL) return;
  const uid = String(process.getuid());
  spawnSync('launchctl', ['bootout', `gui/${uid}`, plistPath()], { stdio: 'ignore' });
  execFileSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath()], { stdio: 'inherit' });
  console.log(`  loaded ${LABEL}: nightly at 11:30 PM; log ${path.join(HOME_DIR, 'nightly.log')}`);
}

function uninstallAgent() {
  if (!process.env.PARITY_NO_LAUNCHCTL) spawnSync('launchctl', ['bootout', `gui/${process.getuid()}`, plistPath()], { stdio: 'inherit' });
  fs.rmSync(plistPath(), { force: true });
  console.log(`  removed ${LABEL}`);
}

// ---------------------------------------------------------------- the selftest

/*
  The comparison on made-up sweeps: the same numbers must give nothing, a
  change the size of tonight's noise must give nothing, and each change a
  regression would make must give its line. If a visible change passes, the
  comparison measures nothing; if noise fails, every night is red with it.
*/
function selftest() {
  let bad = 0;
  const ok = (c, what, got = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${got !== '' ? `  (${got})` : ''}`); if (!c) bad++; };
  const plate = (o = {}) => ({ luma: 0.3, colours: 0.5, flat: 0.2, detail: 0.05, cast: 0.1, motion: 0.01, ...o });
  const look = (id, o = {}) => ({ area: 'Looks', control: id, look: id, fps: 60, reading: plate(o.reading), later: plate(o.later ?? o.reading), noise: {}, faults: [] , ...(o.fps ? { fps: o.fps } : {}) });
  const ctl = (name, o = {}) => ({ area: 'Desk › Lens', control: `${name} (range)`, look: 'classic', settings: 1, dom: 2, plate: 5, faults: [], ...o });
  const side = (readings, findings = []) => ({ readings, findings, coverage: [] });
  const base = side([look('classic'), look('roy'), ctl('Tank'), ctl('Focus'), { area: 'Desk', control: 'tab 1', look: 'classic', fps: 60, reading: plate() }]);

  ok(compare(base, structuredClone(base)).length === 0, 'the same sweep twice: nothing differs');
  const nudged = structuredClone(base);
  nudged.readings[0].reading.luma += 0.02; nudged.readings[0].fps = 55; nudged.readings[2].plate = 2;
  ok(compare(base, nudged).length === 0, 'a change the size of noise (luma +0.02, 5 fps, a control 5→2× drift): nothing',
    compare(base, nudged).map((r) => r.what).join(', '));

  const one = (mut) => { const h = structuredClone(base); mut(h); return compare(base, h); };
  const says = (rows, what) => rows.some((r) => r.what === what);
  ok(says(one((h) => { h.readings[0].reading.luma = 0.2; h.readings[0].later.luma = 0.2; }), 'luma down'), 'a look darker at both moments: "luma down"');
  ok(!one((h) => { h.readings[0].reading.luma = 0.2; }).length, 'darker at one moment only (a passing swirl): nothing');
  ok(!one((h) => { h.readings[0].reading.luma = 0.2; h.readings[0].later.luma = 0.4; }).length, 'past it both ways at the two moments: nothing');
  ok(says(one((h) => { h.readings[1].fps = 30; }), 'slower'), 'a look at half its frame rate: "slower"');
  ok(says(one((h) => { h.readings[2].settings = 0; }), 'no longer moves any setting'), 'a dial that stopped moving its setting');
  ok(says(one((h) => { h.readings[3].plate = 0.4; }), 'no longer shows on the plate'), 'a dial that stopped reaching the plate');
  ok(says(one((h) => { h.readings.splice(1, 1); }), 'swept on the base, not on the branch'), 'a look gone from the branch');
  ok(says(one((h) => { h.findings.push({ area: 'Looks', control: 'roy', look: 'roy', kind: 'black', sev: 'high' }); }), 'new finding: black'), 'a new finding');
  ok(one((h) => { h.readings[4].reading.flat = 0.5; }).some((r) => r.what === 'flat up' && r.area === 'Desk'), 'a desk tab, one moment: "flat up"');

  // What the branch did not read is a line, never a match (the skeptic's controls, 2026-11-27).
  ok(says(one((h) => { h.readings[0].reading = null; h.readings[0].later = null; }), 'plate (opening) not read on the branch'), 'the branch\'s plate unread: "not read on the branch"');
  ok(says(one((h) => { h.readings[3].plate = null; }), 'plate not read on the branch'), 'a dial\'s plate unread on the branch: a line');
  ok(says(one((h) => { h.readings[0].reading.luma = NaN; h.readings[0].later.luma = NaN; }), 'plate (opening) not read on the branch'), 'a NaN on the branch: a line');
  ok(says(compare(side([]), side([])), 'measured nothing on the base or the branch'), 'two empty sweeps: "measured nothing", not "nothing differs"');
  ok(says(compare(base, side([])), 'measured nothing on the branch'), 'an empty branch: "measured nothing on the branch"');
  {
    const b1 = structuredClone(base); b1.readings[0].later = null; const h1 = structuredClone(b1);
    h1.readings[0].reading.luma = 0.05;
    ok(says(compare(b1, h1), 'luma down'), 'a look with one moment on both sides is judged on it (at twice the tolerance)');
    const h2 = structuredClone(b1); h2.readings[0].reading.luma = 0.36;
    ok(!compare(b1, h2).length, 'and one moment a little off (0.06, under twice 0.04) is not');
  }
  {
    const dup = side([...base.readings, ctl('Tank')]); const h3 = structuredClone(dup); h3.readings[2].settings = 0;
    ok(says(compare(dup, h3), 'no longer moves any setting'), 'two readings of one key: the first\'s regression is not overwritten');
  }
  ok(shapeProblem(base.readings[0]) === null && shapeProblem(base.readings[2]) === null && shapeProblem(base.readings[4]) === null, 'the shapes the bug bash writes pass');
  {
    const { plate: _p, ...renamed } = ctl('Tank'); renamed.moved = 5;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-')); fs.writeFileSync(path.join(dir, 'findings-desk.json'), JSON.stringify({ readings: [renamed, look('classic')], findings: [] }));
    const got = readSweep(dir); fs.rmSync(dir, { recursive: true, force: true });
    ok(got.problems.length === 1 && got.readings.length === 2, 'a field renamed in the bug bash is a misshapen reading, and the piece fails', got.problems[0]);
  }

  // Tonight's noise raises a floor, and leaves the others alone.
  const aa2 = structuredClone(base); aa2.readings[0].reading.detail += 0.008; aa2.readings[0].later.detail += 0.008;
  aa2.findings.push({ area: 'Looks', control: 'classic', look: 'classic', kind: 'still', sev: 'med' });
  const t = tolerancesFrom(base, aa2);
  ok(Math.abs(t.tol.detail.abs - 0.016) < 1e-9 && !t.noisy.length && t.tol.luma.abs === TOL.luma.abs, 'a noisy night: detail\'s tolerance raised to twice the spread, luma\'s kept',
    `detail ${t.tol.detail.abs.toFixed(3)}, luma ${t.tol.luma.abs}`);
  const h = structuredClone(base); h.readings[0].reading.detail += 0.012; h.readings[0].later.detail += 0.012;
  h.findings.push({ area: 'Looks', control: 'classic', look: 'classic', kind: 'still', sev: 'med' });
  ok(compare(base, h).length === 2 && compare(base, h, t).length === 0, 'and a change inside tonight\'s noise, and tonight\'s flaky finding, are not called',
    `${compare(base, h).length} without, ${compare(base, h, t).length} with`);

  // One flake in the control cannot blind a measure: the raise is capped and the measure called noisy.
  const aa3 = structuredClone(base); aa3.readings[0].reading.luma = 0.01; aa3.readings[0].later.luma = 0.01;
  const t3 = tolerancesFrom(base, aa3);
  const h4 = structuredClone(base); h4.readings[1].reading.luma = 0.05; h4.readings[1].later.luma = 0.05;
  const r4 = compare(base, h4, t3);
  ok(Math.abs(t3.tol.luma.abs - 0.12) < 1e-9 && says(r4, 'luma down') && says(r4, 'luma too noisy to judge tonight'),
    'a control look black on its second run: luma capped at three times its floor, a real drop still called, and the night says luma was noisy',
    `luma ${t3.tol.luma.abs.toFixed(2)}, ${r4.map((r) => r.what).join(', ')}`);

  const p = piecesFor({ looks: Array.from({ length: 41 }, (_, i) => `l${i}`), tabs: [1, 2], phone: true });
  ok(p.length === 7 + 2 + 1 && p[6].looks.length === 5, 'pieces: 41 looks in seven, two tabs, the phone', p.map((x) => x.name).join(' '));
  ok(new Set(NIGHTS.flatMap((n) => n.tabs)).size === 7 && NIGHTS.some((n) => n.phone), 'four nights cover all seven desk tabs and the phone');
  const pl = plistText({ clone: '/Users/x/cg-scratch/parity/clone', node: '/opt/homebrew/bin/node' });
  ok(pl.includes('<key>Hour</key><integer>23</integer>') && pl.includes('parity-nightly.sh') && pl.includes('git checkout -q --detach origin/main'),
    'the agent runs main\'s nightly script from its own clone at 11:30 PM');
  const md = report({ baseRef: 'a', headRef: 'b', merged: ['abc 49a: x (#1)'], rows: one((h) => { h.readings[1].fps = 30; }), night: t, covered: ['looks-1'], skipped: [], started: Date.now() });
  ok(/## Medium \(1\)/.test(md) && /\| roy \| roy \| slower \| 60 \| 30 \|/.test(md), 'the report lists the difference with both numbers');
  console.log(bad ? `\n  ${bad} FAIL` : '\n  all ok');
  process.exit(bad ? 1 : 0);
}

// ---------------------------------------------------------------- main

if (has('selftest')) selftest();
else if (argv[0] === 'install-agent') installAgent();
else if (argv[0] === 'uninstall-agent') uninstallAgent();
else await run();
