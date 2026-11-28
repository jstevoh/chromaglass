#!/usr/bin/env node
/**
 * reelreader's public judging skill: bundled whole, named for nobody, and its
 * test set's answers still true (PLAN 47p-5b).
 *
 *   npm run reelset              the bundle, the scan and the four shipped clips
 *   npm run reelset -- --fetch   also the linked real show (archive.org, a minute of it)
 *
 * The owner asked (2026-11-27) for a judging skill anyone can install with the
 * tool: lenses for each kind of user, a read of what is in a video, honesty
 * rules first, the helper agent and the words guide bundled in, a worked
 * example and a small test set with known answers. It lives in
 * `reelreader/skill/`, the folder the release copies as it stands, so three
 * things can go wrong without anyone seeing: a file the skill links is not in
 * the folder (the copy ships a dead link); the folder names this project, its
 * owner or a model (the release carries it into a public package that is
 * deliberately kept apart from the app); and the test set's key drifts from
 * what the tool measures (a key that says "the freeze runs 4.7 to 10.3 s"
 * when the tool no longer finds it teaches the wrong answer).
 *
 *   (a) the skill's front matter names it and says when to use it; the
 *       helper is an agent file with no model line (a model is the user's
 *       choice, and the repository names none);
 *   (b) every relative link in every page of the folder reaches a file in
 *       the folder; the scan is shown to have read the pages and found links;
 *   (c) no page and no clip's tags name this project, its places, its plan, a
 *       run script of this repository or a model, and the folder holds no other
 *       kind of file; each pattern is shown to catch a planted line, and the scan
 *       is shown to catch exactly that
 *       in this repository's own layer (.claude/skills/watch/SKILL.md), so a
 *       green scan is not a scan that matches nothing;
 *   (d) every clip in answers.json is in the folder, under 1 MB, and every
 *       clip in the folder is in the key (none shipped unexplained);
 *   (e) each clip, watched with the key's flags, measures what the key leans
 *       on: its read (liquid or general, and by what; a read the flags force
 *       is never claimed, only held to have been honoured), its cuts, its freezes
 *       (from `freezes()`, the tool's own detector), its turning and its own
 *       flow. The bad takes run with --liquid, as the key says a known liquid
 *       take always should (a fault can knock out a liquid cue, 47p-3b);
 *   (f) the bad takes' faults are real and different: the frozen take holds
 *       one stillness the good take does not have, and the turned take's
 *       curl is far from the good take's, so the key's two faults are in the
 *       pictures and not in the bands.
 *
 * `summaryMisses` in the key are things the summary does not say today though
 * the frames show them (the freeze read as "one steady pace", the turn as
 * churning flow). They are printed as notes, never as passes or failures:
 * holding the summary to its own blind spot would fail the day a fault
 * detector (PLAN 7a) fixes it, and that day the key wants rewriting, which
 * the note says.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { watchVideo, freezes, findFfmpeg } from './watch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SKILL = path.join(ROOT, 'reelreader', 'skill');
const SET = path.join(SKILL, 'testset');
const FETCH = process.argv.includes('--fetch');
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const note = s => console.log(`note ${s}`);
const within = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo - 1e-9 && v <= hi + 1e-9;
const f2 = v => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : String(v));

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(SKILL);
const pages = files.filter(f => f.endsWith('.md'));
const rel = f => path.relative(ROOT, f);

// (a) front matter.
const front = src => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(src);
  if (!m) return null;
  return Object.fromEntries(m[1].split('\n').map(l => /^(\w[\w-]*):\s*(.*)$/.exec(l)).filter(Boolean).map(x => [x[1], x[2]]));
};
const skillFm = front(fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8'));
check('(a) SKILL.md names the skill reelreader and says when to use it', skillFm?.name === 'reelreader' && /\bUse when\b/.test(skillFm?.description ?? ''), JSON.stringify(skillFm?.name));
const agentPath = path.join(SKILL, 'agents', 'video-watcher.md');
const agentFm = fs.existsSync(agentPath) ? front(fs.readFileSync(agentPath, 'utf8')) : null;
check('(a) the helper is an agent file (name, description, tools) with no model line', !!agentFm?.name && !!agentFm?.description && !!agentFm?.tools && !('model' in agentFm), agentFm ? Object.keys(agentFm).join(',') : 'missing');

// (b) links. Markdown links [text](target), the target relative (not a URL,
// not an anchor alone); an anchor after a file is dropped.
let linkCount = 0;
const dead = [];
for (const p of pages) {
  const src = fs.readFileSync(p, 'utf8');
  const targets = [...src.matchAll(/\]\(([^)\s]+)\)/g), ...src.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm), ...src.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]);
  for (const t of targets) {
    if (/^[a-z]+:/i.test(t) || t.startsWith('#')) continue;
    linkCount++;
    const target = path.resolve(path.dirname(p), t.split('#')[0]);
    if (!target.startsWith(SKILL + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) dead.push(`${rel(p)} -> ${t}`);
  }
}
check('(b) the scan read the skill\'s pages and found their links', pages.length >= 6 && linkCount >= 10, `${pages.length} pages, ${linkCount} links`);
check('(b) every relative link reaches a file inside the skill folder', !dead.length, dead.join('; '));

// (c) named for nobody. Whole words, any case, so "ChromaGlass" and
// "chromaglass-films" both show; "npm run" because the package runs as
// reelreader, not as this repository's scripts.
const BANNED = [
  [/chroma[\s_-]*glass/i, 'the project'],
  [/project-files|cg-scratch|\/Users\/|\/home\/[a-z]/i, "the project's places"],
  [/\bthe owner\b|\bowner['’]s\b/i, 'the owner'],
  [/\bPLAN(\.md)?\b|\bplan\s+§?\d{1,2}[a-z]*(-\d+[a-z]?)?\b/i, "the project's plan"],
  [/\.claude\//, "this repository's agent folder"],
  [/\bnpm run\b/, 'a run script of this repository'],
  [/\b(opus|sonnet|haiku|fable|gpt-?\d|gemini)(?![a-z])/i, 'a model'],
];
const scanText = (name, src) => {
  const hits = [];
  src.split('\n').forEach((line, i) => { for (const [re, what] of BANNED) if (re.test(line)) hits.push(`${name}:${i + 1} ${what}`); });
  return hits;
};
// Every file is scanned: text as text, a clip by its container's tags (a
// title or comment an encoder kept would ship with it). A file of any other
// kind fails, so a new kind of file is looked at before it ships unscanned.
const VIDEO = /\.(mp4|webm|mkv|mov)$/i, TEXT = /\.(md|json|txt)$/i;
const odd = files.filter(f => !VIDEO.test(f) && !TEXT.test(f));
check('(c) the folder holds only pages and clips (every file is scanned)', !odd.length, odd.map(rel).join(', '));
const tags = f => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags:stream_tags', '-of', 'default=nw=1', f], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
};
const clipTags = files.filter(f => VIDEO.test(f)).map(f => [f, tags(f)]);
check('(c) every clip\'s tags were read', clipTags.length >= 3 && clipTags.every(([, t]) => t != null), clipTags.filter(([, t]) => t == null).map(([f]) => rel(f)).join(', '));
const hits = [
  ...files.filter(f => TEXT.test(f)).flatMap(f => scanText(rel(f), fs.readFileSync(f, 'utf8'))),
  ...clipTags.flatMap(([f, t]) => scanText(`${rel(f)} tags`, t ?? '')),
];
check('(c) no page of the skill names the project, its places, its plan, its scripts or a model', !hits.length, hits.slice(0, 8).join('; '));
// One line for each pattern, written the ways a slip would be: each must be
// caught, so no pattern is one that matches nothing.
const PLANTED = ["ChromaGlass's plate", "/mnt/project-files/x and /home/user/y", "on the owner's Mac", 'PLAN 47p-5b', '.claude/skills/watch', 'npm run watch', 'Opus5 wrote it'];
const plantedMissed = PLANTED.filter((line, i) => !scanText('planted', line).some(h => h.endsWith(BANNED[i][1])));
check('(c) the scan catches each of its patterns in a planted line', !plantedMissed.length, plantedMissed.join(' | '));
// The project's own layer lives only in this repository. The packaged copy
// (reelreader's own repository, built by scripts/reelreaderpack.mjs) is known by
// a positive sign, its plugin file, never by something missing: anywhere else
// the layer is read, and a missing one throws.
const layer = path.join(ROOT, '.claude', 'skills', 'watch', 'SKILL.md');
if (!fs.existsSync(path.join(ROOT, '.claude-plugin', 'plugin.json'))) {
  const layerHits = scanText('layer', fs.readFileSync(layer, 'utf8'));
  const kinds = new Set(layerHits.map(h => h.split(' ').slice(1).join(' ')));
  check("(c) the scan catches the project's own layer on top (so it can see what it scans for)", kinds.has('the project') && kinds.has('a run script of this repository'), [...kinds].join(', '));
} else note('a packaged copy: no project layer to scan');

// (d) the clips and the key.
const key = JSON.parse(fs.readFileSync(path.join(SET, 'answers.json'), 'utf8'));
const shipped = fs.readdirSync(SET).filter(f => /\.(mp4|webm|mkv|mov)$/i.test(f)).sort();
const keyed = key.clips.map(c => c.file).sort();
check('(d) every clip in the folder is in the key, and every keyed clip is in the folder', JSON.stringify(shipped) === JSON.stringify(keyed) && shipped.length >= 3, `${shipped.join(', ')} | ${keyed.join(', ')}`);
const big = shipped.filter(f => fs.statSync(path.join(SET, f)).size > 1024 * 1024);
check('(d) every clip is under 1 MB', !big.length, big.join(', '));

// (e) what the tool measures on each clip.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reelset-'));
const flagOpts = flags => ({ liquid: flags.includes('--liquid') ? true : flags.includes('--general') ? false : null });

async function read(name, file, flags) {
  const r = await watchVideo(file, { out: path.join(tmp, name), quiet: true, ...flagOpts(flags) });
  const p = r.design.physics ?? {};
  return {
    r, liquid: r.mode.liquid, how: r.mode.how, cuts: r.cuts.length, frz: freezes(r),
    curl: p.curl?.med, own: p.own?.med, carried: p.carried?.med,
    summary: fs.readFileSync(path.join(r.out, 'summary.md'), 'utf8'),
  };
}

function hold(name, got, e, flags = []) {
  const tag = `(e) ${name}`;
  // A forced read measures nothing about the clip: the key may not claim one.
  // What a flag can be held to is that it was honoured, with the read it asks for.
  if ('liquid' in e && (flags.includes('--liquid') || flags.includes('--general'))) check(`${tag}: the key claims a read the flags force`, false, flags.join(' '));
  if (flags.includes('--liquid')) check(`${tag}: --liquid honoured, with the physics read`, got.liquid === true && got.how === '--liquid' && /^## Physics/m.test(got.summary), `liquid ${got.liquid} by ${got.how}`);
  if ('liquid' in e) check(`${tag}: read as ${e.liquid ? 'liquid' : 'general'}${e.readBy ? ` by the ${e.readBy}` : ''}`, got.liquid === e.liquid && (!e.readBy || got.how === e.readBy), `liquid ${got.liquid} by ${got.how}`);
  if (e.cuts) check(`${tag}: ${e.cuts[0]} to ${e.cuts[1]} cuts`, within(got.cuts, e.cuts), `${got.cuts}`);
  if ('freezes' in e) check(`${tag}: ${e.freezes} freeze${e.freezes === 1 ? '' : 's'}`, got.frz.length === e.freezes, JSON.stringify(got.frz.map(z => [f2(z.from), f2(z.to)])));
  if (e.freezeFrom) check(`${tag}: the freeze from ${e.freezeFrom[0]}-${e.freezeFrom[1]} s to ${e.freezeTo[0]}-${e.freezeTo[1]} s`, within(got.frz[0]?.from, e.freezeFrom) && within(got.frz[0]?.to, e.freezeTo), `${f2(got.frz[0]?.from)} to ${f2(got.frz[0]?.to)}`);
  if ('curlAbsMax' in e) check(`${tag}: no turning (|curl| under ${e.curlAbsMax}/s)`, Number.isFinite(got.curl) && Math.abs(got.curl) < e.curlAbsMax, f2(got.curl));
  if ('curlAbsMin' in e) check(`${tag}: turning (|curl| over ${e.curlAbsMin}/s)`, Number.isFinite(got.curl) && Math.abs(got.curl) > e.curlAbsMin, f2(got.curl));
  if (e.ownFlow) check(`${tag}: its own flow ${e.ownFlow[0]} to ${e.ownFlow[1]}% of the width a second`, within(got.own, e.ownFlow), f2(got.own));
  if (e.carried) check(`${tag}: carried ${e.carried[0]} to ${e.carried[1]}`, within(got.carried, e.carried), f2(got.carried));
}

const reads = {};
for (const c of key.clips) {
  reads[c.name] = await read(c.name, path.join(SET, c.file), c.flags);
  hold(c.name, reads[c.name], c.expect, c.flags);
  for (const m of c.summaryMisses ?? []) {
    if (reads[c.name].summary.includes(m.says)) note(`${c.name}: the summary still says "${m.says}" over ${m.what}; the key's warning stands`);
    else note(`${c.name}: the summary no longer says "${m.says}" over ${m.what}: update testset/README.md and answers.json`);
  }
}

// (f) the faults are in the pictures.
const g = reads['good-take'], fz = reads['frozen-take'], tu = reads['turned-take'];
if (g && fz && tu) {
  check('(f) the frozen take has a stillness the good take has not', fz.frz.length === 1 && g.frz.length === 0 && fz.frz[0].seconds >= 4, `${fz.frz.length} vs ${g.frz.length}, ${f2(fz.frz[0]?.seconds)} s`);
  check("(f) the turned take's curl is at least five times the good take's", Number.isFinite(tu.curl) && Number.isFinite(g.curl) && Math.abs(tu.curl) >= 5 * Math.max(Math.abs(g.curl), 0.01), `${f2(tu.curl)} vs ${f2(g.curl)}`);
} else check('(f) the key holds the good, frozen and turned takes', false, Object.keys(reads).join(', '));

// The linked real show, only when asked: it is fetched from archive.org.
if (FETCH) {
  for (const l of key.linked ?? []) {
    const file = path.join(tmp, `${l.name}.mp4`);
    const got = spawnSync(findFfmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(l.from), '-i', l.url, '-t', String(l.to - l.from), '-c', 'copy', file], { stdio: 'inherit' });
    if (got.status !== 0 || !fs.existsSync(file)) { check(`(e) ${l.name}: fetched`, false, l.url); continue; }
    hold(l.name, await read(l.name, file, l.flags), l.expect, l.flags);
    if (l.withLiquid) hold(`${l.name} --liquid`, await read(`${l.name}-liquid`, file, ['--liquid']), l.withLiquid, ['--liquid']);
  }
} else note('the linked real show was not fetched (npm run reelset -- --fetch)');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${total - failed}/${total} ${failed ? 'FAIL' : 'ok'}`);
process.exit(failed ? 1 : 0);
