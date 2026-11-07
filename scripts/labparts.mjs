/*
  Which parts of the lab a check calls, and so which of the site's files it
  reads (PLAN.md 19ak-3b).

  Every physics check opens the same lab page (`scripts/lab.mjs`), and that
  page is one bundle of `scripts/lab-entry.ts`, which makes 27 imports from
  src/: the solver, the plate renderer, the output's projector and the
  libraries behind the hands, the presets and the pours. Until this, a check's
  reads were that whole bundle (and, through the trace's comments, more), so a
  change to the plate's shader or to the squish's library ran all 68 of the
  Mac's lab checks, the ones that never draw a plate or press a finger among
  them. Replayed over
  main's last 100 merges on 2026-11-01: 34 touched a file of the lab's bundle;
  17 of those touched the solver itself, which every lab check runs and must
  keep running, 10 only the plate renderer or the projector, and 7 only a
  library a few checks call.

  So a check's reads of the lab are worked out from what it calls: the names
  it reaches on `lab.` (in the page, `window.lab`), and from lab-entry.ts's
  own text which imports each of those parts uses, followed through the file's
  helpers and through a part calling another (`api.x`, `this.x`). What every
  check gets whatever it calls (the core) is `create`, which builds the solver,
  and the file's top-level values. Only the imports are decided here; esbuild
  then gives each import's own graph exactly, as it did for the whole bundle.

  Why text and not the TypeScript compiler's tree: the reach job runs before
  `npm ci`, with esbuild alone, and esbuild has no syntax tree to hand out.
  lab-entry.ts is written in one shape (an `api` object whose parts sit at two
  spaces, helpers at the left margin), and the selftest in `npm run checks`
  holds the reading to it: every import must be reached by some part, or the
  reading has lost one.

  It can under-read only where a check reaches a part by a name the scan does
  not see (`lab[name]`, a part handed round under another name). The scan
  answers "every part" when it sees `lab[` or `lab.${`, and `scripts/lab.mjs`
  records, while every check runs, each part the page really reads off
  `window.lab`; at `close()` a part whose imports the scan of that check's
  scripts did not reach fails the check by name. So a wrong reading turns its
  own check red on the first run, never a quiet skip later.
*/
import fs from 'node:fs';
import path from 'node:path';

export const LAB_ENTRY = 'scripts/lab-entry.ts';

const IDENT = /[A-Za-z_$][\w$]*/g;
const refsOf = (text) => new Set(text.match(IDENT) ?? []);

/*
  The file's imports, its top-level blocks and the `api` object's parts.
  Returns `specsOf(keys)`: the import specifiers the core and those parts
  need, and `keys`, every part's name.
*/
export function labParts(text) {
  const bind = new Map(); // a local name → the specifier it is imported from
  const sideEffects = [];
  for (const m of text.matchAll(/^import\s+(type\s+)?([^'";]*?)\s+from\s+'([^']+)';/gms)) {
    if (m[1]) continue;
    const spec = m[3];
    let clause = m[2].trim();
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const p = part.trim();
        if (!p || /^type\s/.test(p)) continue;
        bind.set(p.split(/\s+as\s+/).pop().trim(), spec);
      }
      clause = clause.replace(braces[0], '');
    }
    for (const d of clause.split(',').map((s) => s.trim()).filter(Boolean)) bind.set(d.replace(/^\*\s+as\s+/, ''), spec);
  }
  for (const m of text.matchAll(/^import\s+'([^']+)';/gm)) sideEffects.push(m[1]);

  // Top-level blocks: each starts at a line on the left margin that is not a
  // comment, a closing bracket or an import, and runs to the next.
  const lines = text.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s|^$|^\/\/|^\/\*|^\*|^[}\])]|^import\s/.test(l)) { if (blocks.length && !/^import\s/.test(l)) blocks.at(-1).lines.push(l); continue; }
    const d = /^(?:export\s+)?(?:declare\s+)?(async\s+function|function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/.exec(l);
    blocks.push({ kind: d?.[1] ?? 'statement', name: d?.[2] ?? null, lines: [l] });
  }
  const helpers = new Map();
  const core = new Set(sideEffects);
  const keyBody = new Map();
  const coreRefs = new Set();
  for (const b of blocks) {
    if (b.kind === 'type' || b.kind === 'interface') continue; // erased: no import of theirs runs
    if (b.name === 'api') {
      let key = null;
      for (const l of b.lines.slice(1)) {
        // Several values handed out as they are, on one line (`  BeadField,
        // rasterDrops,`): each is a part of its own, which reads its name.
        const list = /^ {2}([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)+)\s*,?\s*$/.exec(l);
        if (list) {
          for (const n of list[1].split(',').map((x) => x.trim())) keyBody.set(n, (keyBody.get(n) ?? '') + n + '\n');
          key = null;
          continue;
        }
        const k = /^ {2}(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*(?:[(:,]|$)/.exec(l);
        if (k) { key = k[1]; keyBody.set(key, (keyBody.get(key) ?? '') + l + '\n'); } else if (key) keyBody.set(key, keyBody.get(key) + l + '\n');
      }
      continue;
    }
    const body = b.lines.join('\n');
    if (/function/.test(b.kind) || b.kind === 'class') helpers.set(b.name, body);
    else for (const r of refsOf(body)) coreRefs.add(r);
  }
  const keyRefs = new Map([...keyBody].map(([k, body]) => {
    const r = refsOf(body);
    for (const m of body.matchAll(/\b(?:api|this)\.([A-Za-z_$][\w$]*)/g)) r.add(`api.${m[1]}`);
    return [k, r];
  }));
  const helperRefs = new Map([...helpers].map(([h, body]) => [h, refsOf(body)]));

  // Everything a set of identifiers reaches, through helpers and other parts.
  const close = (start) => {
    const specs = new Set();
    const seen = new Set();
    const todo = [...start];
    while (todo.length) {
      const r = todo.pop();
      if (seen.has(r)) continue;
      seen.add(r);
      if (bind.has(r)) specs.add(bind.get(r));
      if (helperRefs.has(r)) todo.push(...helperRefs.get(r));
      if (r.startsWith('api.') && keyRefs.has(r.slice(4))) todo.push(...keyRefs.get(r.slice(4)));
    }
    return specs;
  };
  const coreSpecs = close([...coreRefs, 'api.create']);
  for (const s of coreSpecs) core.add(s);
  const specsOf = (keys) => {
    const out = new Set(core);
    const want = keys == null ? [...keyRefs.keys()] : [...keys].filter((k) => keyRefs.has(k));
    for (const s of close(want.map((k) => `api.${k}`))) out.add(s);
    return out;
  };
  return { keys: [...keyRefs.keys()], core, specsOf, imports: new Set([...bind.values(), ...sideEffects]) };
}

/*
  A script's text without its comments, so that a comment naming a part
  ("the lab's `lab.render`") or a script ("what `scripts/desktop.mjs` re-runs")
  is not read as the check calling or running it. A `//` after a colon or a
  quote is a URL's or a string's, and stays.
*/
export const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

/*
  The repository's paths a script names in a string, by the rule of
  `checks.mjs`'s trace (from the root, `src/gpu/wgsl/plate.ts`, or from the
  script's own folder, `./lab.mjs`; a folder only below the top), but in its
  code alone: the lab pages it opens, the scripts it runs, the files it reads.
*/
export function namedPaths(text, file, root) {
  const out = new Set();
  for (const m of codeOf(text).matchAll(/['"`]([^'"`\s$]{3,200})['"`]/g)) {
    const s = m[1].replace(/[?#].*$/, '');
    const c = /^\.\.?\//.test(s) ? path.normalize(path.join(path.dirname(file), s))
      : /^(scripts|src|public|docs|server|\.claude)\//.test(s) ? path.normalize(s) : null;
    const p = c?.replace(/\/$/, '');
    if (!p || p.startsWith('..') || !fs.existsSync(path.join(root, p))) continue;
    if (fs.statSync(path.join(root, p)).isDirectory() && !p.includes('/')) continue;
    out.add(p);
  }
  return out;
}

/*
  The parts a check's scripts name on `lab.` (the page's global, and a
  harness's `const lab = window.lab`), or null for every part when a script
  reaches one by a name built at run time. Names that are not parts
  (`lab.page`, `lab.close` on what `openLab` returns) fall away in `specsOf`.
*/
export function labKeysOf(texts) {
  const keys = new Set();
  for (const raw of texts) {
    const t = codeOf(raw);
    if (/\blab\s*\[|\blab\.\$\{|\blab\?\.\[/.test(t)) return null;
    for (const m of t.matchAll(/\blab\??\.([A-Za-z_$][\w$]*)/g)) keys.add(m[1]);
  }
  return keys;
}

// A specifier of lab-entry.ts's, as the repository's path to its file.
export function resolveSpec(spec, root, from = LAB_ENTRY) {
  if (!spec.startsWith('.')) return null; // a package: not the repository's
  const base = path.normalize(path.join(path.dirname(from), spec));
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}/index.ts`]) {
    const abs = path.join(root, c);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return c;
  }
  return null;
}

/*
  The scripts a running check is made of, for `lab.mjs`'s guard: the check's
  own file and the relative imports its code makes, followed. This is a subset of
  what `checks.mjs`'s trace reads for the same check (the trace also follows
  every path string), so a part this finds the reach scan finds too.
*/
export function scriptsOf(file, root) {
  const out = new Set();
  const todo = [file];
  while (todo.length) {
    const f = todo.pop();
    if (out.has(f)) continue;
    let text;
    try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
    out.add(f);
    for (const m of codeOf(text).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](\.\.?\/[^'"]+)['"]/gm)) {
      const p = path.normalize(path.join(path.dirname(f), m[1]));
      if (/\.(mjs|js)$/.test(p) && p.startsWith('scripts/')) todo.push(p);
    }
  }
  return out;
}
