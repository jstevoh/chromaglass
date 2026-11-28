// An unused-code report across `src/` (`npm run unused`; PLAN.md 50g).
//
//   npm run unused                       print the report across src/ (always exits 0)
//   npm run unused -- --json             print the report as JSON
//   node scripts/unused.mjs --selftest   verify the analyser on synthetic trees
//
// Why it never fails CI: helper exports, split modules, and state or GPU fields
// regularly sit mid-move across staged PRs (PLAN 50c) or await a follow-up UI
// slice, so turning unused-code detection into a red gate punishes small moves.
// Instead this runs on TypeScript's compiler API in ~20 s, exits 0, and lists
// three things for the weekly tidy PR (with field/state dataflow in `unused-fields.mjs`):
//   1. Files nothing imports (rooted at index.html, src/main.tsx, checkHooks.ts,
//      Workers, vite.config.ts, server/, mcp/, and static/dynamic/esbuild scripts/).
//   2. Exports nobody imports (marking `dead` vs `internal` file-local use).
//   3. Fields set, never read (write-only class fields, PingPong pairs never
//      written or swapped, unread React useState slots, and unread typed fields).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { analyseUnusedFields, idsNamed, lineOf } from './unused-fields.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE_EXT = /\.(ts|tsx|js|mjs)$/;
const TRY_EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js', '/index.mjs'];
const FS_READ_RE = /\b(readFileSync|readFile|existsSync|statSync)\b/;

const toPosix = (p) => p.split(path.sep).join('/');

function walkCode(root, relDir, out = []) {
  const abs = path.join(root, relDir);
  if (!fs.existsSync(abs)) return out;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const rel = path.posix.join(relDir, ent.name);
    if (ent.isDirectory()) walkCode(root, rel, out);
    else if (CODE_EXT.test(ent.name)) out.push(rel);
  }
  return out;
}

function resolveSpec(root, fromFile, rawSpec) {
  if (!rawSpec || /^(data|https?|node):/.test(rawSpec)) return null;
  const spec = rawSpec.replace(/[?#].*$/, '');
  if (!spec) return null;
  const base = (spec.startsWith('./') || spec.startsWith('../'))
    ? path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec))
    : spec.startsWith('@/') ? path.posix.normalize(spec.slice(2))
    : spec.startsWith('/src/') ? path.posix.normalize(spec.slice(1))
    : spec.startsWith('src/') ? path.posix.normalize(spec)
    : null;
  if (!base) return null;
  const stripped = base.replace(/\.(ts|tsx|js|mjs)$/, '');
  for (const b of (stripped !== base ? [base, stripped] : [base])) {
    for (const ext of TRY_EXTS) {
      const cand = b + ext;
      const abs = path.join(root, cand);
      if (CODE_EXT.test(cand) && fs.existsSync(abs) && fs.statSync(abs).isFile()) return cand;
    }
  }
  return null;
}

function collectWindowHookNames(program, srcSet) {
  const names = new Set();
  const addMembers = (members) => {
    for (const m of members) {
      if (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) names.add(m.name.text);
    }
  };
  for (const sf of program.getSourceFiles()) {
    if (!sf.__rel || !srcSet.has(sf.__rel)) continue;
    const visit = (node) => {
      if (ts.isInterfaceDeclaration(node) && node.name.text === 'Window') addMembers(node.members);
      else if (ts.isTypeAliasDeclaration(node) && ts.isIntersectionTypeNode(node.type) && /\bWindow\b/.test(node.type.getText(sf))) {
        for (const part of node.type.types) if (ts.isTypeLiteralNode(part)) addMembers(part.members);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return names;
}

function collectFileExports(sf, root, relFile) {
  const declared = new Map();
  const starFrom = [];
  const put = (name, kind, line, localName = name, reexportFrom = null) =>
    declared.set(name, { name, kind, line, localName, reexportFrom });
  const addBindings = (nameNode, kind, stLine) => {
    if (ts.isIdentifier(nameNode)) {
      put(nameNode.text, kind === 'var' && /^[A-Z][A-Z0-9_]*$/.test(nameNode.text) ? 'const' : kind, stLine);
    } else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
      for (const el of nameNode.elements) if (!ts.isOmittedExpression(el)) addBindings(el.name, kind, stLine);
    }
  };

  for (const st of sf.statements) {
    const stLine = lineOf(sf, st);
    if (ts.isExportDeclaration(st)) {
      const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? resolveSpec(root, relFile, st.moduleSpecifier.text) : null;
      if (!st.exportClause) { if (spec) starFrom.push(spec); continue; }
      if (ts.isNamespaceExport(st.exportClause)) {
        put(st.exportClause.name.text, 're-export', stLine, null, spec ? { file: spec, name: '*' } : null);
      } else if (ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          const outName = el.name.text, orig = (el.propertyName ?? el.name).text;
          const kind = st.isTypeOnly || el.isTypeOnly ? 'type' : spec ? 're-export' : 'value';
          put(outName, kind, lineOf(sf, el), spec ? null : orig, spec ? { file: spec, name: orig } : null);
        }
      }
      continue;
    }
    if (ts.isExportAssignment(st)) {
      if (!st.isExportEquals) put('default', 'default', stLine, ts.isIdentifier(st.expression) ? st.expression.text : null);
      continue;
    }
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined;
    if (!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      put('default', 'default', stLine, st.name && ts.isIdentifier(st.name) ? st.name.text : null);
      continue;
    }
    if (ts.isVariableStatement(st)) {
      const k = (st.declarationList.flags & ts.NodeFlags.Const) ? 'var' : 'let';
      for (const d of st.declarationList.declarations) addBindings(d.name, k, lineOf(sf, d));
    } else if (ts.isFunctionDeclaration(st) && st.name) put(st.name.text, 'function', stLine);
    else if (ts.isClassDeclaration(st) && st.name) put(st.name.text, 'class', stLine);
    else if (ts.isInterfaceDeclaration(st)) put(st.name.text, 'interface', stLine);
    else if (ts.isTypeAliasDeclaration(st)) put(st.name.text, 'type', stLine);
    else if (ts.isEnumDeclaration(st)) put(st.name.text, 'enum', stLine);
  }
  return { declared, starFrom };
}

function namespaceReads(scopeNode, checker, identNode) {
  const sym = checker ? checker.getSymbolAtLocation(identNode) : null;
  const props = new Set();
  let opaque = false;
  const visit = (node) => {
    if (opaque) return;
    if (ts.isIdentifier(node) && node !== identNode && node.text === identNode.text) {
      const s = checker ? checker.getSymbolAtLocation(node) : null;
      if (!sym || !s || s === sym) {
        const p = node.parent;
        if (ts.isPropertyAccessExpression(p) && p.expression === node) props.add(p.name.text);
        else if (ts.isQualifiedName(p) && p.left === node) props.add(p.right.text);
        else { opaque = true; return; }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(scopeNode);
  return opaque ? null : props;
}

function dynamicImportReads(sf, checker, callNode) {
  const p = callNode.parent;
  if (ts.isArrowFunction(p) && ts.isCallExpression(p.parent)) {
    const c = p.parent.expression;
    if ((ts.isIdentifier(c) && c.text === 'lazy') || (ts.isPropertyAccessExpression(c) && c.name.text === 'lazy')) return new Set(['default']);
  }
  const bindingReads = (pat, scope) => {
    if (ts.isObjectBindingPattern(pat)) {
      const out = new Set();
      for (const el of pat.elements) if (!ts.isOmittedExpression(el)) out.add((el.propertyName ?? el.name).text);
      return out;
    }
    return ts.isIdentifier(pat) ? namespaceReads(scope, checker, pat) : null;
  };
  if (ts.isAwaitExpression(p) && ts.isVariableDeclaration(p.parent)) return bindingReads(p.parent.name, sf);
  if (ts.isPropertyAccessExpression(p) && p.name.text === 'then' && ts.isCallExpression(p.parent) && p.parent.arguments[0]) {
    const fn = p.parent.arguments[0];
    if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.parameters[0]) return bindingReads(fn.parameters[0].name, fn);
  }
  return (ts.isVoidExpression(p) || ts.isExpressionStatement(p)) ? new Set() : null;
}

function identifierWords(text) {
  const out = new Set();
  const sc = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  for (let k = sc.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = sc.scan()) {
    if (k === ts.SyntaxKind.Identifier) out.add(sc.getTokenText());
  }
  return out;
}

function inFsReadCall(sf, node) {
  for (let anc = node.parent, d = 0; anc && d < 3; d++, anc = anc.parent) {
    if (ts.isCallExpression(anc) && FS_READ_RE.test(anc.expression.getText(sf))) return true;
  }
  return false;
}

function scanImportsInFile(sf, checker, root, relFile, srcByBasename) {
  const fileDeps = new Set();
  const symbolImports = [];
  const inSrc = relFile.startsWith('src/');
  const usesEsbuild = !inSrc && /\besbuild\b/.test(sf.text);
  const addImport = (target, name) => {
    if (!target) return;
    fileDeps.add(target);
    if (name) symbolImports.push({ target, name });
  };
  const scanClause = (clause, target, scopeSf, scopeChecker = checker) => {
    if (!clause) return;
    if (clause.name) addImport(target, 'default');
    const nb = clause.namedBindings;
    if (!nb) return;
    if (ts.isNamespaceImport(nb)) {
      const reads = namespaceReads(scopeSf, scopeChecker, nb.name);
      if (reads === null) addImport(target, '*');
      else for (const r of reads) addImport(target, r);
    } else if (ts.isNamedImports(nb)) {
      for (const el of nb.elements) addImport(target, (el.propertyName ?? el.name).text);
    }
  };
  const scanExportClause = (exportClause, target) => {
    if (!exportClause || ts.isNamespaceExport(exportClause)) addImport(target, '*');
    else if (ts.isNamedExports(exportClause)) {
      for (const el of exportClause.elements) addImport(target, (el.propertyName ?? el.name).text);
    }
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveSpec(root, relFile, node.moduleSpecifier.text);
      if (target) { fileDeps.add(target); scanClause(node.importClause, target, sf); }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveSpec(root, relFile, node.moduleSpecifier.text);
      if (target) { fileDeps.add(target); if (!inSrc) scanExportClause(node.exportClause, target); }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      const target = resolveSpec(root, relFile, node.arguments[0].text);
      if (target) {
        fileDeps.add(target);
        const reads = checker ? dynamicImportReads(sf, checker, node) : null;
        if (reads === null) addImport(target, '*');
        else for (const r of reads) addImport(target, r);
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      const target = resolveSpec(root, relFile, node.argument.literal.text);
      if (target) {
        fileDeps.add(target);
        addImport(target, node.qualifier ? (ts.isIdentifier(node.qualifier) ? node.qualifier.text : node.qualifier.left.getText(sf)) : '*');
      }
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Worker') {
      const a0 = node.arguments?.[0];
      const u0 = a0 && ts.isNewExpression(a0) && ts.isIdentifier(a0.expression) && a0.expression.text === 'URL' ? a0.arguments?.[0] : null;
      if (u0 && ts.isStringLiteralLike(u0)) {
        const target = resolveSpec(root, relFile, u0.text);
        if (target) fileDeps.add(target);
      }
    } else if (!inSrc && ts.isStringLiteralLike(node)) {
      const txt = node.text;
      if (/\b(?:import|export)\b[\s\S]*?\bfrom\s+['"]/.test(txt)) {
        const snip = ts.createSourceFile(`${relFile}__inline.ts`, txt, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        for (const st of snip.statements) {
          if ((ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
            const target = resolveSpec(root, 'index.ts', st.moduleSpecifier.text) ?? resolveSpec(root, relFile, st.moduleSpecifier.text);
            if (!target) continue;
            fileDeps.add(target);
            if (ts.isImportDeclaration(st)) scanClause(st.importClause, target, snip, null);
            else scanExportClause(st.exportClause, target);
          }
        }
      } else if (/^(?:\.\.?\/)?src\/[\w./-]+$/.test(txt) && !inFsReadCall(sf, node)) {
        const target = resolveSpec(root, 'index.ts', txt) ?? resolveSpec(root, relFile, txt);
        if (target) {
          fileDeps.add(target);
          sf.__words ??= identifierWords(sf.text);
          symbolImports.push({ target, words: sf.__words });
        }
      } else if (usesEsbuild && /^[\w-]+\.(?:ts|tsx)$/.test(txt) && !inFsReadCall(sf, node)) {
        const matches = srcByBasename.get(txt) ?? [];
        if (matches.length === 1) {
          fileDeps.add(matches[0]);
          sf.__words ??= identifierWords(sf.text);
          symbolImports.push({ target: matches[0], words: sf.__words });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { fileDeps, symbolImports };
}

function hasInternalReference(sf, checker, localName, defaultExportUsed) {
  if (!localName) return false;
  let declIdent = null;
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === localName) declIdent = d.name;
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && st.name?.text === localName) {
      declIdent = st.name;
    }
  }
  const targetSym = declIdent ? checker.getSymbolAtLocation(declIdent) : null;
  for (const node of idsNamed(sf, localName)) {
    if (node === declIdent || ts.isExportSpecifier(node.parent)) continue;
    if (ts.isExportAssignment(node.parent) && node.parent.expression === node) {
      if (defaultExportUsed) return true;
      continue;
    }
    const sym = checker.getSymbolAtLocation(node);
    if (!targetSym || !sym || sym === targetSym || (ts.isShorthandPropertyAssignment(node.parent) && checker.getShorthandAssignmentValueSymbol(node.parent) === targetSym)) {
      return true;
    }
  }
  return false;
}

export function analyseRepo(root = ROOT) {
  const t0 = performance.now();
  const srcFiles = walkCode(root, 'src').sort();
  const scriptFiles = walkCode(root, 'scripts').sort();
  const nonSrcFiles = [
    ...(fs.existsSync(path.join(root, 'vite.config.ts')) ? ['vite.config.ts'] : []),
    ...walkCode(root, 'server').sort(),
    ...walkCode(root, 'mcp').sort(),
  ];

  const srcByBasename = new Map();
  for (const f of srcFiles) {
    const b = path.posix.basename(f);
    if (!srcByBasename.has(b)) srcByBasename.set(b, []);
    srcByBasename.get(b).push(f);
  }

  const tsconfigPath = path.join(root, 'tsconfig.json');
  let compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true, jsx: ts.JsxEmit.ReactJSX, noEmit: true, skipLibCheck: true };
  if (fs.existsSync(tsconfigPath)) {
    const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(tsconfigPath, ts.sys.readFile).config, ts.sys, root);
    compilerOptions = { ...parsed.options, allowJs: true, noEmit: true, skipLibCheck: true };
  }

  const allRelFiles = [...new Set([...srcFiles, ...scriptFiles, ...nonSrcFiles])];
  const allRelSet = new Set(allRelFiles);
  const program = ts.createProgram(allRelFiles.map((f) => path.join(root, f)), compilerOptions);
  const checker = program.getTypeChecker();

  const srcSet = new Set(srcFiles);
  for (const sf of program.getSourceFiles()) {
    const rel = toPosix(path.relative(root, sf.fileName));
    if (!rel.startsWith('..')) sf.__rel = rel;
  }

  const windowHooks = collectWindowHookNames(program, srcSet);
  const fileGraph = new Map();
  const exportTable = new Map();
  const rawImports = [];

  for (const sf of program.getSourceFiles()) {
    const rel = sf.__rel;
    if (!rel || !allRelSet.has(rel)) continue;
    if (srcSet.has(rel)) exportTable.set(rel, collectFileExports(sf, root, rel));
    const { fileDeps, symbolImports } = scanImportsInFile(sf, checker, root, rel, srcByBasename);
    fileGraph.set(rel, fileDeps);
    for (const imp of symbolImports) rawImports.push({ fromRel: rel, ...imp });
  }

  const roots = new Set();
  const indexHtml = path.join(root, 'index.html');
  if (fs.existsSync(indexHtml)) {
    for (const m of fs.readFileSync(indexHtml, 'utf8').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
      const entry = resolveSpec(root, 'index.html', m[1]);
      if (entry && srcSet.has(entry)) roots.add(entry);
    }
  }
  if (srcSet.has('src/main.tsx')) roots.add('src/main.tsx');
  if (srcSet.has('src/lib/checkHooks.ts')) roots.add('src/lib/checkHooks.ts');
  for (const f of srcFiles) if (f.endsWith('.d.ts')) roots.add(f);

  const scriptRootSrc = new Set();
  for (const extFile of [...scriptFiles, ...nonSrcFiles]) {
    for (const dep of fileGraph.get(extFile) ?? []) {
      if (srcSet.has(dep)) { roots.add(dep); scriptRootSrc.add(dep); }
    }
  }

  const closeSrcGraph = (seeds) => {
    const vis = new Set();
    const q = [...seeds];
    while (q.length) {
      const cur = q.pop();
      if (vis.has(cur) || !srcSet.has(cur)) continue;
      vis.add(cur);
      for (const dep of fileGraph.get(cur) ?? []) if (srcSet.has(dep) && !vis.has(dep)) q.push(dep);
    }
    return vis;
  };
  const scriptImportedSrc = closeSrcGraph(scriptRootSrc);
  const reachableSrc = closeSrcGraph(roots);

  const unusedFiles = srcFiles
    .filter((f) => !f.endsWith('.d.ts') && !reachableSrc.has(f))
    .map((file) => ({ file, bytes: fs.statSync(path.join(root, file)).size }));

  const usedExports = new Set();
  const markExportUsed = (file, name, seen = new Set()) => {
    const key = `${file}::${name}`;
    if (!srcSet.has(file) || seen.has(key)) return;
    seen.add(key);
    const entry = exportTable.get(file);
    if (!entry) return;
    if (name === '*') {
      for (const [expName, decl] of entry.declared) {
        usedExports.add(`${file}::${expName}`);
        if (decl.reexportFrom) markExportUsed(decl.reexportFrom.file, decl.reexportFrom.name, seen);
      }
      for (const starTarget of entry.starFrom) markExportUsed(starTarget, '*', seen);
      return;
    }
    const decl = entry.declared.get(name);
    if (decl) {
      usedExports.add(key);
      if (decl.reexportFrom) markExportUsed(decl.reexportFrom.file, decl.reexportFrom.name, seen);
    } else {
      for (const starTarget of entry.starFrom) markExportUsed(starTarget, name, seen);
    }
  };

  for (const imp of rawImports) {
    if (!srcSet.has(imp.target)) continue;
    if (imp.fromRel.startsWith('src/') && (!reachableSrc.has(imp.fromRel) || imp.fromRel === imp.target)) continue;
    if (imp.words) {
      const entry = exportTable.get(imp.target);
      if (!entry) continue;
      let matched = 0;
      for (const expName of entry.declared.keys()) {
        if (imp.words.has(expName)) { markExportUsed(imp.target, expName); matched++; }
      }
      if (matched === 0) markExportUsed(imp.target, '*');
    } else {
      markExportUsed(imp.target, imp.name);
    }
  }

  const unusedExports = [];
  for (const file of [...reachableSrc].sort()) {
    const entry = exportTable.get(file);
    const sf = program.getSourceFile(path.join(root, file));
    if (!entry || !sf) continue;
    const defaultUsed = usedExports.has(`${file}::default`);
    for (const [name, decl] of entry.declared) {
      if (usedExports.has(`${file}::${name}`)) continue;
      const internal = decl.localName ? hasInternalReference(sf, checker, decl.localName, defaultUsed) : false;
      unusedExports.push({ file, line: decl.line, name, kind: decl.kind, scope: internal ? 'internal' : 'dead' });
    }
  }
  unusedExports.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name));

  const unusedFields = analyseUnusedFields(program, checker, reachableSrc, scriptFiles, nonSrcFiles, windowHooks, scriptImportedSrc);
  return { srcFileCount: srcFiles.length, elapsedMs: Math.round(performance.now() - t0), unusedFiles, unusedExports, unusedFields };
}

export function formatReport(r) {
  const deadCount = r.unusedExports.filter((e) => e.scope === 'dead').length;
  const lines = [
    `unused report (src/, ${r.srcFileCount} files, ${(r.elapsedMs / 1000).toFixed(2)} s): ` +
      `${r.unusedFiles.length} files nothing imports, ${r.unusedExports.length} exports nobody imports, ${r.unusedFields.length} fields set and never read`,
    '',
    `Files nothing imports (${r.unusedFiles.length}):`,
    ...(r.unusedFiles.length ? r.unusedFiles.map((f) => `  ${f.file} (${f.bytes} B)`) : ['  (none)']),
    '',
    `Exports nobody imports (${r.unusedExports.length}: ${deadCount} dead, ${r.unusedExports.length - deadCount} internal-only):`,
    ...(r.unusedExports.length ? r.unusedExports.map((e) => `  ${e.file}:${e.line}  ${e.name} (${e.kind}, ${e.scope})`) : ['  (none)']),
    '',
    `Fields set, never read (${r.unusedFields.length}):`,
    ...(r.unusedFields.length ? r.unusedFields.map((f) => `  ${f.file}:${f.line}  ${f.name} (${f.kind}: ${f.detail})`) : ['  (none)']),
  ];
  return lines.join('\n');
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unused-selftest-'));
  let fails = 0;
  const check = (what, ok, detail = '') => {
    if (!ok) fails++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} self-test: ${what}${ok || !detail ? '' : ` — ${detail}`}`);
  };
  const put = (rel, content) => {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  try {
    put('tsconfig.json', JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', allowJs: true, jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true },
    }));
    put('index.html', '<script type="module" src="/src/main.tsx"></script>\n');
    put('src/lib/checkHooks.ts', "import type { HookPayload } from './hookTypes';\ndeclare global { interface Window { __cgHook?: () => HookPayload; } }\nexport {};\n");
    put('src/lib/hookTypes.ts', 'export interface HookPayload { aliveThroughWindow: number; }\n');
    put('src/lib/usedByScript.ts', 'export function scriptOnlyHelper() { return 42; }\nexport function nobodyCallsMe() { return 0; }\n');
    put('src/lib/orphan.ts', 'export const ORPHAN = 123;\n');
    put('src/lib/workerTask.ts', 'self.onmessage = () => {};\n');
    put('src/lib/solver.ts', [
      'export class PingPong { a = 1; b = 2; read = 1; write = 2; swap() { const { a, b, read, write } = this; return a + b + read + write; } }',
      'export interface StatsOut { kept: number; unreadMetric: number; }',
      'export class Solver {',
      '  public readonly activeMat: PingPong;',
      '  private unreadCounter = 0;',
      '  public usedValue = 1;',
      '  constructor() { this.activeMat = new PingPong(); this.unreadCounter = 5; }',
      '  step(): StatsOut { this.unreadCounter++; return { kept: this.usedValue, unreadMetric: 9 }; }',
      '}',
      'export function internalHelper() { return 7; }',
      'export function runSolver() { const { kept } = new Solver().step(); return internalHelper() + kept; }',
    ].join('\n'));
    put('src/main.tsx', [
      "import { runSolver } from './lib/solver';",
      'const w = new Worker(new URL("./lib/workerTask.ts", import.meta.url), { type: "module" });',
      'window.__cgHook = () => ({ aliveThroughWindow: runSolver() + (w ? 0 : 1) });',
    ].join('\n'));
    put('scripts/check.mjs', "import { scriptOnlyHelper } from '../src/lib/usedByScript.ts';\nconsole.log(scriptOnlyHelper());\n");

    const r = analyseRepo(dir);
    check('orphan file is reported under unusedFiles, while worker and script-imported file are kept',
      r.unusedFiles.map((f) => f.file).join(',') === 'src/lib/orphan.ts', JSON.stringify(r.unusedFiles));
    check('script-imported export and checkHooks type are kept, while unimported exports are reported with dead vs internal scope',
      JSON.stringify(r.unusedExports.map((e) => `${e.name}:${e.scope}`)) === JSON.stringify(['PingPong:internal', 'StatsOut:internal', 'Solver:internal', 'internalHelper:internal', 'nobodyCallsMe:dead']),
      JSON.stringify(r.unusedExports));
    check('destructuring read and window hook payload field are kept, while unread PingPong, write-only class counter and unread return field are reported',
      JSON.stringify(r.unusedFields.map((f) => f.name)) === JSON.stringify(['StatsOut.unreadMetric', 'Solver.activeMat', 'Solver.unreadCounter']),
      JSON.stringify(r.unusedFields));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(fails ? `FAIL ${fails} self-test(s) failed` : 'all ok');
  return fails;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) process.exit(selfTest() ? 1 : 0);
  const report = analyseRepo(ROOT);
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
  process.exit(0); // Never fail CI: `npm run unused` is a report, not a gate (PLAN 50g).
}
