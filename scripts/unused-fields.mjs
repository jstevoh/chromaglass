// Field, PingPong and React `useState` read/write dataflow for `scripts/unused.mjs` (PLAN.md 50g).
//
// Finds three kinds of write-only state across reachable `src/` modules:
//   - class fields (`PropertyDeclaration` and constructor parameter properties)
//     assigned and never read, or `PingPong` texture pairs allocated and never
//     written or swapped by any pass;
//   - React `useState` slots whose setter runs while the state value (or the
//     hook return property carrying it) is never read;
//   - typed interface and function-return object fields populated in `src/`
//     that no caller or script reads, excluding `Window` hooks, debug reports
//     (`attachDebug`), `*Protocol.ts` / `*Now.ts` seams, and serialized payloads.

import ts from 'typescript';

export const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const unalias = (checker, sym) => (!sym ? null : (sym.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(sym) : sym);

export function idsNamed(sf, text) {
  if (!sf.__idIndex) {
    const idx = new Map();
    const visit = (n) => {
      if (ts.isIdentifier(n)) {
        let arr = idx.get(n.text);
        if (!arr) { arr = []; idx.set(n.text, arr); }
        arr.push(n);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    sf.__idIndex = idx;
  }
  return sf.__idIndex.get(text) ?? [];
}

function lookupByDecls(mapByDecl, sym) {
  const out = [];
  for (const d of sym?.declarations ?? []) {
    const hit = mapByDecl.get(d);
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

function findEnclosingFnName(node) {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if ((ts.isMethodDeclaration(cur) || ts.isFunctionDeclaration(cur)) && cur.name) return cur.name.getText();
  }
  return '';
}

function isPrevStateUpdaterParam(checker, expr) {
  if (!ts.isIdentifier(expr)) return false;
  const decl = checker.getSymbolAtLocation(expr)?.valueDeclaration;
  if (!decl || !ts.isParameter(decl)) return false;
  const fn = decl.parent;
  if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return false;
  const call = fn.parent;
  return ts.isCallExpression(call) && call.arguments[0] === fn && /\bSetStateAction\b/.test(checker.typeToString(checker.getTypeAtLocation(call.expression)));
}

function countIdentSymbolRefs(sf, checker, identNode) {
  const sym = checker.getSymbolAtLocation(identNode);
  let count = 0;
  for (const node of idsNamed(sf, identNode.text)) {
    if (node === identNode) continue;
    const s = checker.getSymbolAtLocation(node);
    if (!sym || !s || s === sym || (ts.isShorthandPropertyAssignment(node.parent) && checker.getShorthandAssignmentValueSymbol(node.parent) === sym)) count++;
  }
  return count;
}

function inspectStateReads(sf, checker, stateIdent, propDeclsByNode) {
  const stateSym = checker.getSymbolAtLocation(stateIdent);
  let liveReads = 0, returnedVia = null;
  for (const node of idsNamed(sf, stateIdent.text)) {
    if (node === stateIdent) continue;
    const isShort = ts.isShorthandPropertyAssignment(node.parent);
    const s = isShort ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
    if (!stateSym || !s || s === stateSym) {
      const propAssign = isShort ? node.parent : (ts.isPropertyAssignment(node.parent) && node.parent.initializer === node ? node.parent : null);
      if (propAssign && ts.isObjectLiteralExpression(propAssign.parent) && ts.isReturnStatement(propAssign.parent.parent)) {
        const obj = propAssign.parent;
        const ctxType = checker.getContextualType(obj) ?? checker.getTypeAtLocation(obj);
        const pName = propAssign.name.getText(sf);
        const infos = lookupByDecls(propDeclsByNode, unalias(checker, ctxType?.getProperty(pName)));
        if (infos.length > 0 && infos.every((i) => i.reads === 0)) { returnedVia = pName; continue; }
      }
      liveReads++;
    }
  }
  return { liveReads, returnedVia };
}

export function analyseUnusedFields(program, checker, reachableSrc, scriptFiles, nonSrcFiles, windowHooks, scriptImportedSrc) {
  const results = [];
  const sfByRel = new Map();
  for (const sf of program.getSourceFiles()) if (sf.__rel) sfByRel.set(sf.__rel, sf);

  const externalPropNames = new Set(windowHooks);
  for (const rel of [...scriptFiles, ...nonSrcFiles]) {
    const sf = sfByRel.get(rel);
    if (!sf) continue;
    const visit = (node) => {
      if (ts.isPropertyAccessExpression(node)) externalPropNames.add(node.name.text);
      else if (ts.isBindingElement(node) && ts.isIdentifier(node.propertyName ?? node.name)) externalPropNames.add((node.propertyName ?? node.name).text);
      else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) externalPropNames.add(node.argumentExpression.text);
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  const classFieldsByDecl = new Map();
  const propDeclsByNode = new Map();
  const escapedContainers = new Set();
  const seenEscapedTypes = new Set();
  const useStateDecls = [];

  const markTypeEscaped = (type, depth = 0) => {
    if (!type || depth > 4 || seenEscapedTypes.has(type)) return;
    seenEscapedTypes.add(type);
    const sym = type.getSymbol() ?? type.aliasSymbol;
    if (sym) escapedContainers.add(sym);
    for (const sig of type.getCallSignatures()) {
      markTypeEscaped(sig.getReturnType(), depth + 1);
      for (const p of sig.getParameters()) {
        const d = p.valueDeclaration ?? p.declarations?.[0];
        if (d) markTypeEscaped(checker.getTypeOfSymbolAtLocation(p, d), depth + 1);
      }
    }
    if (type.isUnionOrIntersection()) for (const t of type.types) markTypeEscaped(t, depth + 1);
    for (const targ of checker.getTypeArguments?.(type) ?? []) markTypeEscaped(targ, depth + 1);
    for (const p of type.getProperties()) {
      const d = p.valueDeclaration ?? p.declarations?.[0];
      if (d && d.getSourceFile().__rel?.startsWith('src/')) markTypeEscaped(checker.getTypeOfSymbolAtLocation(p, d), depth + 1);
    }
  };

  for (const rel of reachableSrc) {
    const sf = sfByRel.get(rel);
    if (!sf) continue;
    const skipPropContainer = rel === 'src/lib/checkHooks.ts' || rel === 'src/engine/debug.ts' || /Protocol\.ts$|Now\.ts$/.test(rel);
    const visitDecls = (node) => {
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        const owner = node.name?.text ?? '<class>';
        for (const m of node.members) {
          if (ts.isPropertyDeclaration(m) && m.name && ts.isIdentifier(m.name)) {
            const mods = ts.getModifiers(m) ?? [];
            if (mods.some((x) => x.kind === ts.SyntaxKind.AbstractKeyword || x.kind === ts.SyntaxKind.DeclareKeyword)) continue;
            const priv = mods.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword);
            const isPingPong = /\bPingPong\b/.test(checker.typeToString(checker.getTypeAtLocation(m)));
            classFieldsByDecl.set(m, { file: rel, line: lineOf(sf, m.name), owner, name: m.name.text, writes: m.initializer ? 1 : 0, reads: 0, copyRefs: [], isPublic: !priv && !m.name.text.startsWith('#'), isPingPong, ppMutated: false });
          } else if (ts.isConstructorDeclaration(m)) {
            for (const p of m.parameters) {
              const mods = ts.getModifiers(p) ?? [];
              const hasMod = mods.some((x) => x.kind === ts.SyntaxKind.PublicKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword || x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ReadonlyKeyword);
              if (hasMod && ts.isIdentifier(p.name)) {
                const priv = mods.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword);
                classFieldsByDecl.set(p, { file: rel, line: lineOf(sf, p.name), owner, name: p.name.text, writes: 1, reads: 0, copyRefs: [], isPublic: !priv, isPingPong: false, ppMutated: false });
              }
            }
          }
        }
      } else if (ts.isInterfaceDeclaration(node) && node.name.text === 'Window') {
        for (const m of node.members) markTypeEscaped(checker.getTypeAtLocation(m));
      } else if (!skipPropContainer && ts.isInterfaceDeclaration(node) && !/Like$/.test(node.name.text)) {
        const parentSym = checker.getSymbolAtLocation(node.name);
        const scriptReachable = !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) && scriptImportedSrc.has(rel);
        for (const m of node.members) {
          if (ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name)) {
            propDeclsByNode.set(m, { file: rel, line: lineOf(sf, m.name), owner: node.name.text, name: m.name.text, parentSym, scriptReachable, writes: 0, reads: 0 });
          }
        }
      } else if (!skipPropContainer && ts.isFunctionDeclaration(node) && node.type && ts.isTypeLiteralNode(node.type) && node.name) {
        const parentSym = checker.getTypeAtLocation(node.type).getSymbol();
        const scriptReachable = !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) && scriptImportedSrc.has(rel);
        for (const m of node.type.members) {
          if (ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name)) {
            propDeclsByNode.set(m, { file: rel, line: lineOf(sf, m.name), owner: `${node.name.text}()`, name: m.name.text, parentSym, scriptReachable, writes: 0, reads: 0 });
          }
        }
      } else if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
        const c = node.initializer.expression;
        if (((ts.isIdentifier(c) && c.text === 'useState') || (ts.isPropertyAccessExpression(c) && c.name.text === 'useState')) && node.name.elements.length >= 2) {
          useStateDecls.push({ rel, sf, node });
        }
      }
      if (rel === 'src/engine/debug.ts' && ts.isObjectLiteralExpression(node)) {
        for (const prop of node.properties) {
          if (ts.isPropertyAssignment(prop)) markTypeEscaped(checker.getTypeAtLocation(prop.initializer));
          else if (ts.isShorthandPropertyAssignment(prop)) markTypeEscaped(checker.getTypeAtLocation(prop));
        }
      }
      ts.forEachChild(node, visitDecls);
    };
    visitDecls(sf);
  }

  const srcPropReadsByName = new Set();
  const structuralForwards = [];

  for (const rel of [...reachableSrc, ...scriptFiles]) {
    const sf = sfByRel.get(rel);
    if (!sf) continue;
    const visitRefs = (node) => {
      const isPropOrElem = ts.isPropertyAccessExpression(node) || (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression));
      if (ts.isPropertyAccessExpression(node)) srcPropReadsByName.add(node.name.text);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left) && /\bwindow\b/.test(node.left.expression.getText(sf))) {
        markTypeEscaped(checker.getTypeAtLocation(node.right));
      }
      if (ts.isCallExpression(node) && /^(JSON\.stringify|structuredClone|Object\.(keys|values|entries|assign)|.*\.postMessage|.*\.send|publish[A-Z]\w*)$/.test(node.expression.getText(sf))) {
        for (const arg of node.arguments) markTypeEscaped(checker.getTypeAtLocation(arg));
      }
      if (isPropOrElem) {
        const nameNode = ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression;
        const sym = unalias(checker, checker.getSymbolAtLocation(nameNode));
        const p = node.parent;
        const isSimpleAssign = ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.left === node;

        for (const info of lookupByDecls(classFieldsByDecl, sym)) {
          const isCompound = ts.isBinaryExpression(p) && p.left === node && p.operatorToken.kind >= ts.SyntaxKind.FirstCompoundAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastCompoundAssignment;
          const isUpdate = (ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken);
          if (isSimpleAssign) {
            info.writes++;
            if (!ts.isExpressionStatement(p.parent)) info.reads++;
          } else if (isUpdate) {
            info.writes++;
            if (!ts.isExpressionStatement(p.parent) && !(ts.isForStatement(p.parent) && p.parent.incrementor === p)) info.reads++;
          } else if (isCompound) {
            info.writes++;
            const logical = p.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken || p.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken || p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken;
            if (logical || !ts.isExpressionStatement(p.parent)) info.reads++;
            if (info.isPingPong && !ts.isExpressionStatement(p.parent)) info.ppMutated = true;
          } else {
            const inSnap = findEnclosingFnName(p) === 'snapshotTargets';
            if (info.isPingPong) {
              if (ts.isPropertyAccessExpression(p) && p.expression === node) {
                if (p.name.text === 'write' || p.name.text === 'swap' || p.name.text === 'a' || p.name.text === 'b') info.ppMutated = true;
              } else if (!inSnap) info.ppMutated = true;
            }
            if (info.isPingPong && ts.isPropertyAssignment(p) && p.initializer === node && inSnap) info.copyRefs.push(rel);
            else info.reads++;
          }
        }

        let propInfos = lookupByDecls(propDeclsByNode, sym);
        if (propInfos.length === 0 && ts.isPropertyAccessExpression(node)) {
          propInfos = lookupByDecls(propDeclsByNode, unalias(checker, checker.getTypeAtLocation(node.expression)?.getProperty(node.name.text)));
        }
        for (const info of propInfos) {
          if (isSimpleAssign) info.writes++;
          else {
            const isSnapLoop = (info.owner === 'SnapshotTargets' || info.owner === 'FieldSnapshot') && rel === 'src/gpu/fluid/snapshot.ts' && info.name === 'activeMat';
            if (!isSnapLoop && !isPrevStateUpdaterParam(checker, node.expression)) info.reads++;
          }
        }
      } else if (ts.isBindingElement(node) && !ts.isOmittedExpression(node)) {
        const pn = node.propertyName ?? node.name;
        if (ts.isIdentifier(pn)) {
          srcPropReadsByName.add(pn.text);
          if (ts.isObjectBindingPattern(node.parent)) {
            const targetSym = unalias(checker, checker.getTypeAtLocation(node.parent)?.getProperty(pn.text));
            const classHits = lookupByDecls(classFieldsByDecl, targetSym);
            const propHits = lookupByDecls(propDeclsByNode, targetSym);
            if ((classHits.length || propHits.length) && (!ts.isIdentifier(node.name) || countIdentSymbolRefs(sf, checker, node.name) > 0)) {
              for (const info of classHits) info.reads++;
              for (const info of propHits) info.reads++;
            }
          }
        }
      } else if (ts.isObjectLiteralExpression(node)) {
        let anc = node.parent;
        while (anc && (ts.isArrayLiteralExpression(anc) || ts.isAsExpression(anc) || ts.isParenthesizedExpression(anc))) anc = anc.parent;
        const ctxType = (anc && ts.isSatisfiesExpression(anc)) ? checker.getTypeAtLocation(node) : (checker.getContextualType(node) ?? checker.getTypeAtLocation(node));
        for (const prop of node.properties) {
          if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
            const pName = prop.name && ts.isIdentifier(prop.name) ? prop.name.text : null;
            if (pName) for (const info of lookupByDecls(propDeclsByNode, unalias(checker, ctxType?.getProperty(pName)))) info.writes++;
          } else if (ts.isSpreadAssignment(prop)) {
            const spreadType = checker.getTypeAtLocation(prop.expression);
            if (!spreadType?.getSymbol() || spreadType.getSymbol() !== ctxType?.getSymbol()) {
              for (const p of spreadType.getProperties()) for (const info of lookupByDecls(propDeclsByNode, p)) info.reads++;
            }
          }
        }
      } else if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
        for (const info of lookupByDecls(propDeclsByNode, unalias(checker, checker.getSymbolAtLocation(node.name)))) info.writes++;
        if (node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          const valType = checker.getTypeAtLocation(node.initializer.expression);
          const attrType = checker.getContextualType(node.initializer.expression);
          if (valType && attrType && valType.getSymbol() !== attrType.getSymbol()) {
            const nonNull = attrType.getNonNullableType();
            for (const p of valType.getProperties()) {
              if (nonNull.getProperty(p.name)) for (const info of lookupByDecls(propDeclsByNode, p)) structuralForwards.push(info);
            }
          }
        }
      } else if (ts.isJsxSpreadAttribute(node)) {
        for (const p of checker.getTypeAtLocation(node.expression).getProperties()) {
          for (const info of lookupByDecls(propDeclsByNode, p)) info.reads++;
        }
      }
      ts.forEachChild(node, visitRefs);
    };
    visitRefs(sf);
  }

  for (const info of structuralForwards) if (srcPropReadsByName.has(info.name)) info.reads++;

  for (const info of classFieldsByDecl.values()) {
    if (info.writes === 0 || (info.isPublic && info.reads === 0 && externalPropNames.has(info.name))) continue;
    if (info.reads === 0) {
      results.push({ file: info.file, line: info.line, kind: 'class-field', name: `${info.owner}.${info.name}`, detail: info.copyRefs.length ? 'set and copied by undo snapshot only, never read or written by any pass' : 'set, never read' });
    } else if (info.isPingPong && !info.ppMutated) {
      results.push({ file: info.file, line: info.line, kind: 'gpu-field', name: `${info.owner}.${info.name}`, detail: 'PingPong allocated, never written or swapped by any pass' });
    }
  }

  const deadStateSyms = new Set();
  for (const { rel, sf, node } of useStateDecls) {
    const [el0, el1] = node.name.elements;
    if (!ts.isBindingElement(el1) || !ts.isIdentifier(el1.name)) continue;
    const setterCalls = countIdentSymbolRefs(sf, checker, el1.name);
    if (setterCalls === 0) continue;
    const sites = `${setterCalls} site${setterCalls === 1 ? '' : 's'}`;
    if (ts.isOmittedExpression(el0)) {
      results.push({ file: rel, line: lineOf(sf, node), kind: 'react-state', name: `[, ${el1.name.text}]`, detail: `useState value omitted while ${el1.name.text}() is called (${sites})` });
    } else if (ts.isBindingElement(el0) && ts.isIdentifier(el0.name)) {
      const stateUse = inspectStateReads(sf, checker, el0.name, propDeclsByNode);
      if (stateUse.liveReads === 0) {
        const stateTypeSym = checker.getTypeAtLocation(el0.name)?.getSymbol();
        if (stateTypeSym) deadStateSyms.add(stateTypeSym);
        results.push({
          file: rel,
          line: lineOf(sf, el0.name),
          kind: 'react-state',
          name: el0.name.text,
          detail: stateUse.returnedVia
            ? `useState updated via ${el1.name.text}() (${sites}), returned as .${stateUse.returnedVia} which no caller reads`
            : `useState updated via ${el1.name.text}() (${sites}), never read`,
        });
      }
    }
  }

  for (const info of propDeclsByNode.values()) {
    if (info.writes === 0 || info.reads > 0) continue;
    if (info.parentSym && (escapedContainers.has(info.parentSym) || deadStateSyms.has(info.parentSym))) continue;
    if (info.scriptReachable && externalPropNames.has(info.name)) continue;
    results.push({ file: info.file, line: info.line, kind: 'field', name: `${info.owner}.${info.name}`, detail: 'set, never read' });
  }

  results.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name));
  return results;
}
