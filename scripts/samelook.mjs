#!/usr/bin/env node
/**
 * The look did not change (PLAN.md 46-0): the guard every speed-up is held to.
 *
 *   npm run samelook                      this tree against where it left origin/main
 *   npm run samelook -- --ref <commit>    against another commit
 *   npm run samelook -- --looks classic,roy
 *
 * What was asked (the owner, 2026-11-09): hunt for a faster opening, no
 * dropped frames, anything that makes the show cheaper to run, and "of course
 * visual quality and realism is the most important thing". A speed-up is
 * easy to find and hard to trust: the cheapest way to make a step cost less is
 * a coarser grid, a shorter solve, a cheaper advection, a smaller picture,
 * and every one of those makes the plate softer, blurrier or duller while each
 * check of the physics that tolerates a little error stays green. This is the
 * check that says the picture is the one it was.
 *
 * How: the same plates are laid, stepped and drawn twice, once by this tree's
 * solver and plate shader and once by the commit it is compared against
 * (checked out beside it, with its own lab), on the lab's software WebGPU,
 * which computes the same bytes every time for the same program
 * (`npm run lampzero` leans on the same fact). The plates are the shipped
 * looks, each with its own dyes, its own liquid poured in its own shape, a
 * seeded stir, the solver parts it switches on (its magnet, its second
 * phase, its film, its reaction) and its own settings drawn whole and in a
 * close-up (scripts/samelook-scenes.mjs). Then two kinds of comparison:
 *
 *   - after five and twenty steps, pixel for pixel. A few steps from the same
 *     plate are the same picture in any solver that does the same arithmetic
 *     (a fused kernel, a buffer written once instead of twice, a pass skipped
 *     when it has nothing to do); a change that only moves a rounding stays
 *     within a level or two of 255 that soon, and a change to the motion or
 *     to how the plate is drawn shows at once. Not one step, because one
 *     moves the liquid too little for a slower or damped step to show; and
 *     twenty as well as five, for a shortcut that only starts as the plate
 *     settles.
 *
 *   - after sixty steps, as a picture: the colour, the detail and the spread
 *     of colours, not the pixels. A flowing plate is chaotic: a change that
 *     only moves a rounding moves where an eddy curls by a cell after a few
 *     dozen steps, so the pixels part while the look is the same, and a check
 *     on the pixels would fail every honest change. What a cheaper display
 *     or camera loses is not where things are but how sharp, how saturated
 *     and how fine they are: the mean colour, the detail (the mean size of
 *     the brightness's gradient, which a blur or a smaller picture takes down
 *     first), and the colours' histogram. And each look must be a picture at
 *     all in this tree, or a look drawn blank in both would pass.
 *
 * And the controls, every run, on Classic and Roy (Roy's dots are a threshold
 * at the pixel, where one rounding can flip a pixel whole): the same tree
 * twice must be identical, or the lab is not deterministic and the comparison
 * means nothing; the two trees must have run different programs exactly when
 * src/ differs (the bundles' hashes, the `lampzero` pattern), or the
 * comparison was of one program with itself; a change the size of a rounding
 * (the advection one part in ten thousand off) must pass every bar, or the
 * bars would fail an honest change; and changes a person can see, each a
 * shortcut a speed hunt would be tempted by, must each fail one: a coarser
 * grid (96² for 128², the "lower the rung" shortcut), the picture drawn at
 * half its pixels and scaled up (the "lower the share" one), the flow a tenth
 * slower (a cheaper or damped step), and Ferro Paint with its magnet off (a
 * look's own physics skipped). If a visible control passes, the bars are too
 * loose and the run is red. (Ten times the dye's diffusion was tried as a
 * blur and one percent more viscosity as the rounding, and neither moved a
 * byte: the thin gap every look opens on reads neither. A control has to
 * change something the step reads.)
 *
 * In CI it runs on a pull request labelled `same-look` when it was opened, or
 * whose title starts with an id of the hunt's (a §46 id, or H2c-, 14aa-,
 * 14ab-), against the pull request's base, and the base only; on anything
 * else it says it was not asked and passes, because a pull request that means
 * to change the look (a new look, a shader that draws better) is supposed to
 * fail it. It is red on such a pull request that edits the instrument itself
 * (the lab, its browser, this guard): the ruler changes in a pull request of
 * its own. The bars are the owner's to move, never a builder's
 * (docs/handoff.md).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.lastIndexOf(`--${name}`);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
};
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

/*
  The looks: one of each kind of plate the display draws, so a change to most
  branches of the plate shader or the solver is drawn by at least one, each
  whole and in a close-up. Classic (the opening look, oil drops on water),
  Poster, 1969 (the heavy one the governor was tuned on), Soap Film (the
  film's colours), Oil and Water (immiscible liquid), Ferro Paint (the
  ferrofluid) and Roy (Ben-Day dots, a print drawn at the pixel). Six and not
  every look because the lab builds a solver's pipelines again for every plate
  it lays, about eighteen seconds each on SwiftShader; `--looks` takes any.
*/
const LOOKS = arg('looks', 'classic,poster-1969,soap-film,oil-and-water,ferro-paint,roy').split(',');
const CONTROL_LOOKS = ['classic', 'roy'];
const GRID = 128, RENDER = 256, FIRST = 5, MID = 20, STEPS = `${FIRST},${MID},60`;

/*
  The bars, set from the controls' own numbers on main at 9c89a28 (printed by
  every run, so a reader can see the margin), Classic then Roy, plate then
  close-up:
    - after five steps no more than 0.5 % of a picture's pixels more than two
      levels of 255 apart in any channel, after twenty no more than 2 %, and
      at both no more than 0.05 % more than 24 apart (a share, not a maximum:
      Roy's dots are a threshold, where one rounding flips a pixel whole).
      The same tree twice, and the advection one part in ten thousand off:
      0.00 % and 0.000 % everywhere. The flow a tenth slower, at five: 0.78,
      0.68, 1.01, 0.88 % (Roy also past 24 at 0.066 and 0.049 %). A grid of
      96² for 128²: 3.0 to 5.7 %, past 24 0.6 to 3.0 %. Half the pixels: 4.6
      to 15.2 %, past 24 1.3 to 10.1 %. Ferro Paint's magnet off: 9.7 and
      23.9 % at five, 37.8 and 50.4 % at twenty.
    - after sixty: the mean of each channel within 2.5 levels, the detail
      within 6 % either way, and the histograms within 0.06 (half the summed
      difference of three 32-bin channel histograms, 0 the same, 1 disjoint).
      Half the pixels: detail -11.7 % and -27.9 % on Classic. The coarser grid
      and the slower flow pass this one (detail within 1 %, colour within
      0.35): sixty steps on, a 96² plate draws as fine a picture of its own,
      which is why the early lines hold the solver and this one holds what
      the display and the camera make of it.
  What no control has shown yet is an honest change that moves bytes (a
  fused kernel that adds in another order): the rounding-sized control moved
  none. The first such pull request's numbers say whether 0.5 % holds it; if
  it does not, the bar is the owner's to move, in a Claude PR.
*/
const BAR = { share: { [FIRST]: 0.005, [MID]: 0.02 }, far: 0.0005, mean: 2.5, detail: 0.06, hist: 0.06 };

/*
  Who asks. A pull request labelled same-look when it was opened (the briefs
  open them with the label), or titled with an id of the hunt's: a §46 id
  ("46a:", "46b, H2c-7:") or one of the frame-budget ids the hunt builds
  (H2c-, 14aa-, 14ab-). The label is read from the run's own event, so one
  added after the last push is not seen until the next push: the title is
  the gate a builder cannot forget.
*/
const HUNT_TITLE = /^(46[a-z]|H2c-|14a[ab]-)/;
function decide() {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
    if (process.env.CI) return { run: false, why: `a ${process.env.GITHUB_EVENT_NAME ?? 'non-pull-request'} run: the guard is asked by a pull request` };
    return { run: true };
  }
  const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = ev.pull_request ?? {};
  const labelled = (pr.labels ?? []).some((l) => l.name === 'same-look');
  const titled = HUNT_TITLE.test(pr.title ?? '');
  if (!labelled && !titled) return { run: false, why: `pull request #${pr.number} has no same-look label and no title of the hunt's (${HUNT_TITLE.source})` };
  return { run: true, ci: true, base: pr.base?.sha };
}

function refOf(base) {
  const ref = arg('ref', null) ?? base ?? git('merge-base', 'HEAD', 'origin/main');
  try { git('cat-file', '-e', `${ref}^{commit}`); } catch { execFileSync('git', ['fetch', '--depth=1', 'origin', ref], { cwd: ROOT, stdio: 'inherit' }); }
  return git('rev-parse', ref);
}

function scenes(tree, tag, extra = []) {
  const out = join(tmpdir(), `samelook-${tag}-${process.pid}.json`);
  return new Promise((ok, no) => {
    const p = spawn(process.execPath, [join(ROOT, 'scripts/samelook-scenes.mjs'), '--tree', tree, '--tag', tag, '--out', out,
      '--grid', String(GRID), '--size', String(RENDER), '--steps', STEPS, ...extra], { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', (code) => {
      if (code !== 0) return no(new Error(`${tag}: scenes exited ${code}`));
      const j = JSON.parse(readFileSync(out, 'utf8'));
      rmSync(out, { force: true });
      ok(j);
    });
  });
}

const px = (s) => Buffer.from(s.rgba, 'base64');
/** Luminance, Rec. 709 on the 8-bit values (the comparison is of pictures, not light). */
const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];

function stats(b, n) {
  const mean = [0, 0, 0], hist = new Float64Array(96);
  let detail = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (x + y * n) * 4;
    for (let c = 0; c < 3; c++) { mean[c] += b[i + c]; hist[c * 32 + (b[i + c] >> 3)]++; }
    if (x + 1 < n && y + 1 < n) detail += Math.hypot(lum(b, i + 4) - lum(b, i), lum(b, i + n * 4) - lum(b, i));
  }
  const np = n * n;
  return { mean: mean.map((m) => m / np), hist: Array.from(hist, (h) => h / np), detail: detail / ((n - 1) * (n - 1)) };
}

/** `b` scaled up to `n` pixels a side, bilinear, as a browser scales a canvas drawn at a lower share. */
function upscale(b, m, n) {
  const out = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = Math.max(0, (x + 0.5) * m / n - 0.5), fy = Math.max(0, (y + 0.5) * m / n - 0.5);
    const x0 = Math.min(m - 1, Math.floor(fx)), y0 = Math.min(m - 1, Math.floor(fy)), x1 = Math.min(m - 1, x0 + 1), y1 = Math.min(m - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    for (let c = 0; c < 4; c++) {
      const v = (b[(x0 + y0 * m) * 4 + c] * (1 - tx) + b[(x1 + y0 * m) * 4 + c] * tx) * (1 - ty)
        + (b[(x0 + y1 * m) * 4 + c] * (1 - tx) + b[(x1 + y1 * m) * 4 + c] * tx) * ty;
      out[(x + y * n) * 4 + c] = Math.round(v);
    }
  }
  return out;
}

function compare(a, b) {
  const n = a.size, A = px(a), B = b.size === n ? px(b) : upscale(px(b), b.size, n);
  if (a.steps === FIRST || a.steps === MID) {
    let near = 0, far = 0;
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
      if (d > 2) near++;
      if (d > 24) far++;
    }
    const np = A.length / 4, share = near / np, farShare = far / np;
    return { kind: 'pixels', share, far: farShare, ok: share <= BAR.share[a.steps] && farShare <= BAR.far,
      text: `${(share * 100).toFixed(2)} % of pixels past 2, ${(farShare * 100).toFixed(3)} % past 24` };
  }
  const sa = stats(A, n), sb = stats(B, n);
  const mean = Math.max(...sa.mean.map((m, c) => Math.abs(m - sb.mean[c])));
  const detail = sa.detail > 0.05 ? sb.detail / sa.detail - 1 : sb.detail - sa.detail;
  const hist = sa.hist.reduce((s, h, k) => s + Math.abs(h - sb.hist[k]), 0) / 6;
  const ok = mean <= BAR.mean && Math.abs(detail) <= BAR.detail && hist <= BAR.hist;
  return { kind: 'picture', mean, detail, hist, ok, text: `colour ${mean.toFixed(2)}, detail ${(detail * 100).toFixed(1)} %, histogram ${hist.toFixed(3)}` };
}

/** Each shot of `b` against its twin in `a`; the worst of each look's shots decides it. */
function judge(a, b) {
  const byKey = new Map(a.shots.map((s) => [`${s.look}|${s.steps}|${s.cam}`, s]));
  const rows = [];
  for (const s of b.shots) {
    const twin = byKey.get(`${s.look}|${s.steps}|${s.cam}`);
    if (!twin) { rows.push({ look: s.look, steps: s.steps, cam: s.cam, ok: false, text: 'no twin in the other tree' }); continue; }
    rows.push({ look: s.look, steps: s.steps, cam: s.cam, ...compare(twin, s) });
  }
  return rows;
}

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const asked = decide();
if (!asked.run) {
  console.log(`ok   not asked: ${asked.why}`);
  process.exit(0);
}
/*
  In CI the guard is the base and the six looks, nothing else: a `--ref` or
  `--looks` there (from a package.json script, say) would let a run compare
  the tree with itself or with one look.
*/
if (asked.ci && (process.argv.includes('--ref') || process.argv.includes('--looks'))) {
  console.log('FAIL in CI the guard compares against the pull request\'s base on its own looks — --ref or --looks was passed');
  process.exit(1);
}
const ref = refOf(asked.base);
const head = git('rev-parse', '--short', 'HEAD');
const changed = (paths) => git('diff', '--name-only', ref, '--', ...paths).split('\n').filter(Boolean);
/*
  The instrument is this tree's lab, so a pull request that edits the lab
  (its entry, its page, the browser it launches) or this guard edits the
  ruler it is measured with. Such a change goes in a pull request of its own
  that does not ask for this guard.
*/
const INSTRUMENT = ['scripts/lab.mjs', 'scripts/lab-entry.ts', 'scripts/samelook.mjs', 'scripts/samelook-scenes.mjs', 'scripts/chromium.mjs'];
const srcChanged = changed(['src']).length > 0;
console.log(`samelook: this tree (${head}${git('status', '--porcelain', '--untracked-files=no') ? ', with changes' : ''}) against ${ref.slice(0, 9)}, ${LOOKS.length} looks, ${GRID}² stepped, drawn at ${RENDER}; src/ ${srcChanged ? 'differs' : 'the same'}`);
if (asked.ci) {
  const touched = changed(INSTRUMENT);
  check('the pull request leaves the instrument alone (the lab and this guard)', touched.length === 0, touched.join(', ') || 'untouched');
  check('and it is compared with another tree', git('rev-parse', `${ref}^{tree}`) !== git('rev-parse', 'HEAD^{tree}'), `base ${ref.slice(0, 9)}`);
}
const dir = mkdtempSync(join(tmpdir(), 'samelook-ref-'));
try {
  git('worktree', 'add', '--quiet', '--detach', dir, ref);
  if (!existsSync(join(dir, 'node_modules'))) symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  const looks = ['--looks', LOOKS.join(',')], few = ['--looks', CONTROL_LOOKS.join(',')];
  /*
    The two trees side by side, then the controls together: each lab is a
    SwiftShader that takes every core it is given, and everything at once on
    a four-core machine took longer than this.
  */
  const [then, now] = await Promise.all([scenes(dir, 'samelook-ref', looks), scenes(ROOT, 'samelook-head', looks)]);
  const [again, unseen, coarse, half, slow, unmagnet] = await Promise.all([
    scenes(ROOT, 'samelook-again', few),
    scenes(ROOT, 'samelook-round', [...few, '--over', JSON.stringify({ advection: 0.45 * (1 + 1e-4) })]),
    scenes(ROOT, 'samelook-grid', [...few, '--grid', '96']),
    scenes(ROOT, 'samelook-half', [...few, '--render', String(RENDER / 2)]),
    scenes(ROOT, 'samelook-slow', [...few, '--over', JSON.stringify({ advection: 0.405 })]),
    scenes(ROOT, 'samelook-magnet', ['--looks', 'ferro-paint', '--over', JSON.stringify({ magnetStrength: 0 })]),
  ]);
  const own = { shots: now.shots.filter((s) => CONTROL_LOOKS.includes(s.look)) };
  const say = (rows) => rows.map((r) => `${r.look} ${r.steps} ${r.cam}: ${r.text}${r.ok ? '' : ' ✗'}`).join('; ');

  // The controls first: a comparison is only as good as what it can tell apart.
  check('control: the two trees ran their own programs (the lab\'s bundles differ exactly when src/ does)',
    (then.meta.bundle !== now.meta.bundle) === srcChanged, `base ${then.meta.bundle}, this ${now.meta.bundle}`);
  const same = judge(own, again);
  check('control: this tree drawn twice is the same picture, byte for byte',
    same.every((r) => (r.kind === 'pixels' ? r.share === 0 && r.far === 0 : r.mean === 0 && r.hist === 0 && r.detail === 0)), say(same));
  const quiet = judge(own, unseen);
  check('control: a change the size of a rounding (the advection one part in ten thousand off) passes every bar', quiet.every((r) => r.ok), say(quiet));
  for (const [name, rows, on] of [
    ['a coarser grid (96² for 128²)', judge(own, coarse), CONTROL_LOOKS],
    ['the picture at half its pixels, scaled up', judge(own, half), CONTROL_LOOKS],
    ['the flow a tenth slower', judge(own, slow), CONTROL_LOOKS],
    ['Ferro Paint with its magnet off', judge({ shots: now.shots.filter((s) => s.look === 'ferro-paint') }, unmagnet), ['ferro-paint']],
  ]) {
    const caught = [...new Set(rows.filter((r) => !r.ok).map((r) => r.look))];
    check(`control: ${name} fails a bar on every look it is laid on`, on.every((l) => caught.includes(l)), say(rows));
  }

  // Then the change.
  const rows = judge(then, now);
  for (const look of LOOKS) {
    const mine = rows.filter((r) => r.look === look);
    const early = mine.filter((r) => r.steps !== 60), late = mine.filter((r) => r.steps === 60);
    check(`${look}: after ${FIRST} and ${MID} steps the same pixels (past 2 of 255 at most ${BAR.share[FIRST] * 100} % and ${BAR.share[MID] * 100} %, past 24 at most ${BAR.far * 100} %)`,
      early.length > 0 && early.every((r) => r.ok), early.map((r) => `${r.steps} ${r.cam} ${r.text}`).join('; '));
    check(`${look}: after sixty the same picture (colour within ${BAR.mean}, detail within ${BAR.detail * 100} %, histogram within ${BAR.hist})`,
      late.length > 0 && late.every((r) => r.ok), late.map((r) => `${r.cam} ${r.text}`).join('; '));
    /* A look drawn blank in both trees would pass the two above. */
    const d = now.shots.filter((x) => x.look === look && x.steps === 60).map((x) => stats(px(x), x.size).detail);
    check(`${look}: and it is a picture in this tree (detail above 0.5 in every view)`, d.length > 0 && d.every((v) => v > 0.5), d.map((v) => v.toFixed(2)).join(', '));
  }
  console.log(`  (the lab: ${then.meta.seconds.toFixed(0)} s for the other tree, ${now.meta.seconds.toFixed(0)} s for this one)`);
} finally {
  try { git('worktree', 'remove', '--force', dir); } catch { rmSync(dir, { recursive: true, force: true }); }
}
console.log(failed ? `\n${failed} checks failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
