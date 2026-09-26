#!/usr/bin/env node
/**
 * The part of a crash report worth reading first, without the 150 kB of
 * picture and debug state around it.
 *
 *   node .claude/skills/crash-triage/summarize.mjs <report.json> [more.json …]
 *   node .claude/skills/crash-triage/summarize.mjs --digest <digest.json>
 *
 * A report is what the corner dot or the sheet's Save file writes
 * (`kind: "chromaglass-crash-report"`, src/lib/crashLog.ts). A digest is what
 * the report Worker's `/digest` or its daily cron returns
 * (server/report-worker.js).
 */

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const digest = args[0] === '--digest';
const files = digest ? args.slice(1) : args;
if (!files.length) {
  console.error('usage: summarize.mjs <report.json> … | --digest <digest.json>');
  process.exit(2);
}

const clip = (s, n = 160) => { const t = String(s ?? '').replace(/\s*\n\s*/g, ' ⏎ '); return t.length > n ? `${t.slice(0, n)}…` : t; };
const line = (e) => e
  ? `${e.level.padEnd(5)} ${String(e.source).padEnd(9)} +${Number(e.up ?? 0).toFixed(1)}s${e.repeats ? ` ×${e.repeats + 1}` : ''}  ${clip(e.msg)}`
  : '(none)';
const snap = (s) => s ? Object.entries(s).filter(([k]) => k !== 'stats').map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ') : '';

for (const f of files) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  console.log(`\n== ${f}`);

  if (digest) {
    // { days, total, groups: [{ group, line, count, firstSeen, lastSeen, examples, notes }] }
    if (!Array.isArray(r.groups)) { console.log(JSON.stringify(r, null, 2).slice(0, 4000)); continue; }
    console.log(`${r.total} reports over ${(r.days ?? []).join(', ')}`);
    for (const g of r.groups) {
      console.log(`${String(g.count).padStart(4)}  ${clip(g.line ?? g.group, 200)}`);
      console.log(`      ${g.firstSeen} → ${g.lastSeen}  e.g. ${(g.examples ?? []).slice(0, 3).join(', ')}${g.notes?.length ? `  notes: ${g.notes.map((n) => clip(n, 80)).join(' | ')}` : ''}`);
    }
    continue;
  }

  if (r.kind !== 'chromaglass-crash-report') { console.log(`not a crash report (kind=${r.kind})`); continue; }
  const env = r.env ?? {};
  const gpu = env.gpu ?? {};
  console.log(`at ${r.at}  url ${r.url}`);
  if (r.note) console.log(`note: ${clip(r.note, 400)}`);
  const sc = env.screen ?? {};
  console.log(`env: ${clip(env.userAgent, 120)} | ${env.platform ?? '?'} | cores ${env.cores ?? '?'} mem ${env.memoryGB ?? '?'}GB | screen ${sc.width}×${sc.height}@${sc.dpr} | ${env.visibility} | up ${env.upSeconds ?? '?'}s frames ${env.framesThisLoad ?? '?'}`);
  console.log(`gpu: ${gpu.label ?? '(none: the stage never came up)'} class=${gpu.gpuClass ?? '?'} fallback=${gpu.fallback ?? '?'} format=${gpu.format ?? '?'}`);
  console.log(`snapshot: ${snap(r.snapshot)}`);
  console.log(`look: ${r.look?.preset ?? '?'}`);
  console.log(`screenshot: ${r.screenshot ? `${r.screenshot.width}×${r.screenshot.height} painted=${r.screenshot.painted}` : 'none'}`);

  const all = [...(r.previous ?? []), ...(r.log ?? [])];
  const fatal = [...all].reverse().find((e) => e.level === 'fatal');
  const lastPrev = [...(r.previous ?? [])].reverse().find((e) => e.source !== 'unload');
  console.log(`\nthe line it died on: ${line(fatal ?? lastPrev)}`);
  if ((fatal ?? lastPrev)?.snap) console.log(`  its snapshot: ${snap((fatal ?? lastPrev).snap)}`);

  const loads = new Map();
  for (const e of r.history ?? all) { if (!loads.has(e.load)) loads.set(e.load, []); loads.get(e.load).push(e); }
  console.log(`\nloads in the ring: ${loads.size}`);
  for (const [id, es] of loads) {
    const worst = es.some((e) => e.level === 'fatal') ? 'fatal' : es.some((e) => e.level === 'error') ? 'error' : 'ok';
    const unloaded = es.some((e) => e.source === 'unload');
    const tag = id === env.load ? '  (the load that wrote this report)' : unloaded ? '' : '  (never unloaded: crashed or killed)';
    console.log(`  ${id}  ${es.length} lines  worst=${worst}${tag}`);
  }

  console.log('\nprevious load, last 15 lines:');
  for (const e of (r.previous ?? []).slice(-15)) console.log(`  ${line(e)}`);
  console.log('\nthis load, errors and fatals:');
  const bad = (r.log ?? []).filter((e) => e.level === 'error' || e.level === 'fatal');
  for (const e of bad.slice(-15)) console.log(`  ${line(e)}`);
  if (!bad.length) console.log('  (none)');
}
