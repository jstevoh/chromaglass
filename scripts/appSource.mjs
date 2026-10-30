/*
  App()'s source as the checks read it: `src/App.tsx` and the hooks it was split
  into under `src/app/` (PLAN 19ai-8).

  A dozen checks hold the app's wiring to account by reading its source as
  text, because node cannot run a React component: `learn` finds the function
  App hands the sound triggers as `dye` and reads its body, `rowfade` reads
  what a row's fade writes, `cloudsync` reads which stores reload on a sync.
  They were written when all of that sat in one 372 KB file. 19ai-8 moved
  App()'s domains into hooks, statement for statement, so the same code is now
  in thirty-odd files; a check that kept reading `App.tsx` alone would find a
  hook's call where the code it asserts on used to be, and go red, or (worse,
  for a negative assertion) go on passing because the thing it forbids is no
  longer in the file it looks in.

  So a check reads App() whole: `App.tsx` first, then each hook file in name
  order, one after the other. A pattern that matched inside one statement of
  the old file still matches, since a statement moved whole and kept its
  indentation (App's body and a hook's body are both two spaces in). What it
  cannot do is find two pieces in their old order when they now sit in
  different files: a check that slices from one marker to the next has to
  have both in one file, and every such check was run against this when the
  split landed.
*/
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The files, from the repository root: `src/App.tsx`, then `src/app/*` by name. */
export function appFiles(root = process.env.INIT_CWD ?? process.cwd()) {
  const hooks = readdirSync(join(root, 'src/app')).filter(f => /\.tsx?$/.test(f)).sort().map(f => `src/app/${f}`);
  return ['src/App.tsx', ...hooks];
}

/** Their text, joined; `read` takes a path from the root (the check's own reader, so its root holds). */
export function appSource(read = (p) => readFileSync(join(process.env.INIT_CWD ?? process.cwd(), p), 'utf8')) {
  return appFiles().map(read).join('\n');
}
