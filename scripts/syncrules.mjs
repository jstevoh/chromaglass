// Generate Antigravity's per-area rules under `.agents/rules/` from `.claude/rules/`,
// and hold them in sync (`npm run rules -- --check`; PLAN.md 19al-9).
//
//   npm run rules             write `.agents/rules/<area>.md` for every `.claude/rules/<area>.md`
//   npm run rules -- --check  exit 1 if any file is missing, stale, extra, or over 24,000 bytes
//
// Why one canonical source. Every session used to load all of `CLAUDE.md` on every step, and
// Claude Code and Antigravity read separate rule files that could drift. Claude Code loads
// `.claude/rules/<area>.md` when reading paths matching its `paths:` frontmatter; Antigravity
// reads `.agents/rules/<area>.md` via `trigger: model_decision` and its `description:` (see
// `agy-customizations`). Generating `.agents/rules/` from `.claude/rules/` keeps one source.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, '.claude/rules');
const OUT_DIR = path.join(ROOT, '.agents/rules');
export const MAX_BYTES = 24_000;

function formatList(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function parseClaudeRule(text, file) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) throw new Error(`${file}: missing YAML frontmatter (--- ... ---)`);
  const fm = m[1];
  const body = m[2].replace(/^\n+/, '');
  const paths = [];
  let inPaths = false;
  for (const raw of fm.split('\n')) {
    const line = raw.trimEnd();
    if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
    if (inPaths) {
      const item = /^\s+-\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/.exec(line);
      if (item) { paths.push(item[1] ?? item[2] ?? item[3]); continue; }
      if (line.trim() === '') continue;
      inPaths = false;
    }
  }
  if (!paths.length) throw new Error(`${file}: frontmatter needs a non-empty paths list`);
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? file.replace(/\.md$/, '');
  return { paths, heading, body };
}

export function renderAgentsRule(file, text) {
  const { paths, heading, body } = parseClaudeRule(text, file);
  const desc = `Rules for ${formatList(paths)}: ${heading}. Read before changing those files.`;
  const quoted = `"${desc.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return [
    '---',
    'trigger: model_decision',
    `description: ${quoted}`,
    '---',
    '',
    `Generated from .claude/rules/${file} by npm run rules; edit that file, not this one.`,
    '',
    body.replace(/\n+$/, ''),
    '',
  ].join('\n');
}

export function expectedFiles(srcDir = SRC_DIR) {
  if (!fs.existsSync(srcDir)) throw new Error('.claude/rules/ does not exist');
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md')).sort();
  if (!files.length) throw new Error('.claude/rules/ has no .md files');
  return files.map((file) => {
    const src = fs.readFileSync(path.join(srcDir, file), 'utf8');
    const content = renderAgentsRule(file, src);
    return { file, content, bytes: Buffer.byteLength(content, 'utf8') };
  });
}

export function checkRules(srcDir = SRC_DIR, outDir = OUT_DIR) {
  const expected = expectedFiles(srcDir);
  const fails = [];
  const names = new Set(expected.map((e) => e.file));
  for (const { file, content, bytes } of expected) {
    if (bytes > MAX_BYTES) fails.push(`FAIL rules: .agents/rules/${file} is ${bytes} bytes (max ${MAX_BYTES})`);
    const target = path.join(outDir, file);
    if (!fs.existsSync(target)) {
      fails.push(`FAIL rules: .agents/rules/${file} is missing (run npm run rules)`);
      continue;
    }
    const actual = fs.readFileSync(target, 'utf8');
    const actualBytes = Buffer.byteLength(actual, 'utf8');
    if (actualBytes > MAX_BYTES) fails.push(`FAIL rules: .agents/rules/${file} on disk is ${actualBytes} bytes (max ${MAX_BYTES})`);
    if (actual !== content) fails.push(`FAIL rules: .agents/rules/${file} differs from .claude/rules/${file} (run npm run rules)`);
  }
  if (fs.existsSync(outDir)) {
    for (const extra of fs.readdirSync(outDir).sort()) {
      if (!names.has(extra)) fails.push(`FAIL rules: .agents/rules/${extra} has no source in .claude/rules/ (run npm run rules)`);
    }
  }
  return { fails, count: expected.length };
}

export function writeRules(srcDir = SRC_DIR, outDir = OUT_DIR) {
  const expected = expectedFiles(srcDir);
  const over = expected.filter((e) => e.bytes > MAX_BYTES);
  if (over.length) {
    for (const e of over) console.log(`FAIL rules: .agents/rules/${e.file} is ${e.bytes} bytes (max ${MAX_BYTES})`);
    return 1;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const keep = new Set(expected.map((e) => e.file));
  for (const existing of fs.readdirSync(outDir)) {
    if (!keep.has(existing)) fs.rmSync(path.join(outDir, existing), { recursive: true, force: true });
  }
  for (const { file, content } of expected) {
    fs.writeFileSync(path.join(outDir, file), content);
  }
  console.log(`ok rules: wrote ${expected.length} files to .agents/rules/`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const { fails, count } = checkRules();
    if (fails.length) {
      for (const f of fails) console.log(f);
      process.exit(1);
    }
    console.log(`ok rules: ${count} files in sync`);
  } else {
    process.exitCode = writeRules();
  }
}
