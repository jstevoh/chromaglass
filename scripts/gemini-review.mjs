#!/usr/bin/env node
/**
 * A second reader for a diff, from a different model: the branch's changes
 * sent to Gemini with the repo's rules, and its findings printed.
 *
 *   npm run gemini-review                    (origin/main...HEAD)
 *   npm run gemini-review -- <range>         (any range git diff takes)
 *
 * Why a second model at all. The `prepush-reviewer` agent is the same model
 * as the session that wrote the diff, reading it with the same habits; the
 * mistakes it misses are the ones its author was always going to make. A
 * reviewer trained elsewhere misses different things. It is also wrong in
 * different ways, so what this prints is a list of leads, not a verdict: the
 * `gemini-reviewer` agent reads each one against the code before it reports
 * any of them.
 *
 * Why the API and not a command-line tool. Steve asked (2026-09-27) to use
 * the Gemini he already pays for. His Google AI Ultra plan's quota reaches
 * Antigravity's `agy` only through a browser sign-in, and a cloud thread
 * starts in a fresh container every time, so it cannot keep one. The plan's
 * monthly Google Cloud credits do cover the Gemini API, so the cloud threads
 * reach Gemini through a key on that project, read from the environment as
 * GEMINI_API_KEY and never written anywhere by this script.
 *
 * Why curl and not fetch. Node 22's fetch ignores HTTPS_PROXY, and a cloud
 * session reaches the internet only through its proxy. curl honours it there
 * and needs nothing on a Mac. The key goes to curl on stdin, as a config
 * line, so it is not in the process list.
 *
 * It exits 0 when the review ran, whatever it found; 2 when it could not run
 * (no key, no diff, the API refused), with the reason. An unfunded project
 * answers 402, "prepayment credits are depleted": the project was on prepaid
 * billing with nothing bought when this was written, and Google applies the
 * Cloud credits only once some prepaid credit exists.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The alias follows Google's newest Pro model, so this does not need editing
// each time one ships; GEMINI_MODEL pins one when a review must be repeated.
const model = process.env.GEMINI_MODEL || 'gemini-pro-latest';
const range = process.argv[2] || 'origin/main...HEAD';

// A whole diff of a large PR is well inside the model's window; the cap is
// only there so a mistaken range (a year of history) fails loudly instead of
// sending megabytes. Lockfiles say nothing a reviewer can check.
const MAX_CHARS = 900_000;

function fail(msg) {
  console.error(`gemini-review: ${msg}`);
  process.exit(2);
}

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) fail(`git ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout;
}

const key = process.env.GEMINI_API_KEY;
if (!key) {
  fail('GEMINI_API_KEY is not set. It belongs in the cloud environment\'s settings ' +
    '(or your shell on the Mac), never in the repo or a chat.');
}

// Fifteen lines of context rather than three: most of what a reviewer gets
// wrong about a hunk is what the function around it already does.
const diff = git(['diff', '-U15', range, '--', '.', ':(exclude)package-lock.json']);
if (!diff.trim()) fail(`no changes in ${range}`);
if (diff.length > MAX_CHARS) fail(`the diff for ${range} is ${diff.length} characters, over ${MAX_CHARS}; is the range right?`);

const [from, to] = range.includes('...') ? range.split('...') : range.split('..');
const messages = to !== undefined ? git(['log', '--format=%B%n---', `${from}..${to || 'HEAD'}`]) : '';
const rules = readFileSync('CLAUDE.md', 'utf8');

const prompt = `You are reviewing a pull request in ChromaGlass, a WebGPU liquid light show
(TypeScript, React, WGSL shaders in src/gpu/wgsl/ as template literals, node and
Playwright check scripts in scripts/). The repository's working rules follow, then
the commit messages, then the diff.

Report only problems a maintainer would want fixed before merging, most serious first:
1. Bugs: wrong logic, state not reset on some path, resources never released,
   NaN or out-of-range values reaching the GPU, off-by-one errors, races.
2. Things CI will reject, judged against the rules below (for example a promise
   used without await in page.evaluate, a comment naming an npm script that
   does not exist, a backtick inside a WGSL template string).
3. Places where the diff does not do what its commit messages claim.
4. A check that can pass while measuring nothing.

For each finding give: the file and line (in the new version), what is wrong, what
it will cause, and the smallest fix. Quote the line you mean. Do not report matters
of taste, style you merely prefer, or anything you cannot point at in the diff. If
you find nothing, say "No findings." and nothing else.

=== Repository rules (CLAUDE.md) ===
${rules}

=== Commit messages ===
${messages || '(not available for this range)'}

=== Diff (${range}) ===
${diff}`;

const body = {
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  // Low temperature: two runs on the same diff should mostly agree, which is
  // what makes a finding that appears once worth a second look.
  generationConfig: { temperature: 0.2 },
};

const dir = mkdtempSync(join(tmpdir(), 'gemini-review-'));
let res;
try {
  const bodyPath = join(dir, 'body.json');
  writeFileSync(bodyPath, JSON.stringify(body));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const r = spawnSync('curl', ['-sS', '--max-time', '600', '-K', '-', '-H', 'content-type: application/json',
    '--data-binary', `@${bodyPath}`, url], {
    input: `header = "x-goog-api-key: ${key}"\n`,
    encoding: 'utf8',
    maxBuffer: 64 << 20,
  });
  if (r.status !== 0) fail(`curl failed (${r.status}): ${r.stderr.trim()}`);
  try { res = JSON.parse(r.stdout); } catch { fail(`not JSON from the API:\n${r.stdout.slice(0, 500)}`); }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (res.error) {
  const hint = res.error.code === 402
    ? '\n  The key works but its project has no funds. Buy prepaid credit in AI Studio (https://ai.studio/projects); the Ultra plan\'s Cloud credits apply after that.'
    : '';
  fail(`the API refused (${res.error.code} ${res.error.status}): ${res.error.message}${hint}`);
}

const cand = res.candidates?.[0];
const text = (cand?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('').trim();
if (!text) fail(`no answer (finish reason ${cand?.finishReason ?? 'none'}, block ${res.promptFeedback?.blockReason ?? 'none'})`);

const u = res.usageMetadata ?? {};
console.log(`Gemini review of ${range}: ${res.modelVersion ?? model}, ${u.promptTokenCount ?? '?'} tokens in, ${u.candidatesTokenCount ?? '?'} out\n`);
console.log(text);
