#!/usr/bin/env node
/**
 * Everything that can be checked without a GPU, in one command, before a push.
 *
 *   npm run check
 *
 * A push costs a fifteen-minute CI run, and in September half of them came
 * back red. This runs the checks that can fail here, in about a minute:
 * the ubuntu job's harnesses (read from `checks.yml`, so the two lists
 * cannot disagree), the shaders compiling, and the layout (`layout.mjs`).
 * What needs a GPU is left to the macOS job, and this says so at the end
 * rather than letting a green line here stand for it.
 *
 * Every check runs whatever failed before it, so one run finds every
 * failure, not the first.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/checks.yml', import.meta.url), 'utf8');
const measure = /^ {2}measure:\n([\s\S]*?)^ {2}\S/m.exec(workflow)?.[1] ?? '';
const fromCi = [...measure.matchAll(/^\s+run: npm run ([\w:-]+)\s*$/gm)].map(m => m[1]);
// An empty list would be a green run that checked nothing: a renamed job, a
// reindented file. Say so instead.
if (fromCi.length < 5) {
  console.error(`check: found ${fromCi.length} npm scripts in checks.yml's measure job — has it been renamed?`);
  process.exit(2);
}
const steps = [...new Set([...fromCi, 'wgsl', 'layout'])];

const results = [];
const started = Date.now();
for (const name of steps) {
  const t0 = Date.now();
  const r = spawnSync('npm', ['run', '-s', name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const ok = r.status === 0;
  results.push({ name, ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name.padEnd(14)} ${secs.padStart(3)}s`);
  if (!ok) {
    if (!out.trim()) { console.log(`        (no output; exit ${r.status ?? r.signal})`); continue; }
    const lines = out.trim().split('\n');
    const fails = lines.filter(l => /FAIL|error/i.test(l));
    for (const l of (fails.length ? fails : lines).slice(-12)) console.log(`        ${l}`);
  }
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed in ${((Date.now() - started) / 1000).toFixed(0)}s` +
  (failed.length ? ` — failed: ${failed.map(r => r.name).join(', ')}` : ''));
console.log('Not run here: everything that reads the plate (the WebGPU (macOS) job in checks.yml).');
process.exit(failed.length ? 1 : 0);
