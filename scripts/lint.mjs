#!/usr/bin/env node
/**
 * `tsc --noEmit`, with one thing said out loud.
 *
 *   npm run lint
 *
 * A shader in this repository is a TypeScript template literal, and a
 * backtick inside one ends it. Write a WGSL comment the way every other
 * comment here is written — a name in backticks — and the shader stops on
 * that line, everything after it is parsed as TypeScript, and what comes back
 * is
 *
 *     src/gpu/wgsl/plate.ts(1353,10): error TS1005: ',' expected.
 *
 * pointing at a line of perfectly good WGSL. Nothing in that message says
 * backtick, or template literal, or shader.
 *
 * It was rediscovered seven times in one week, a couple of minutes each time.
 * A check cannot prevent it — a file that compiles cannot contain one by
 * definition, which is the whole reason the compiler is the right instrument
 * — so what is added here is the sentence, on the failure that already
 * happens.
 */
import { spawnSync } from 'node:child_process';

const tsc = spawnSync('npx', ['tsc', '--noEmit'], { encoding: 'utf8' });
const out = (tsc.stdout ?? '') + (tsc.stderr ?? '');
process.stdout.write(out);

if (tsc.status !== 0) {
  const shader = out.split('\n').filter(l => /src[/\\]gpu[/\\]wgsl[/\\].*error TS/.test(l));
  // TS1005/TS1109/TS1443 are what an unterminated template produces; a real
  // type error in one of these files looks nothing like this.
  const syntax = shader.filter(l => /TS1005|TS1109|TS1443|TS1002/.test(l));
  if (syntax.length) {
    console.error(
      `\n  ${syntax.length} syntax error(s) inside a shader file.\n\n` +
      `  This is almost always a backtick in a WGSL comment: a shader here is a\n` +
      `  template literal, so a backtick ends it, and the rest of the shader is\n` +
      `  then read as TypeScript. The line the compiler points at is usually the\n` +
      `  first line that is not valid TypeScript — not the line with the backtick,\n` +
      `  which is a little above it.\n\n` +
      `  Write names in WGSL comments without backticks.\n`);
  }
}
process.exit(tsc.status ?? 1);
