/*
  The frame loop's source, wherever it now lives (PLAN 50c, 19ai-10).

  Some checks read the frame loop as text: the wiring they assert (a ref
  reset on a render, a call's arguments) runs only on a GPU, so they read
  that the code says it. The loop is moving out of
  `components/LiquidVisualizer.tsx` into `src/engine/` a piece at a time, as
  pure moves, and a check that read the component alone would go red on a
  move that changed nothing, or (worse) be "fixed" by loosening its pattern.
  So a check of the loop reads this instead: the component, then every
  `src/engine/` file in name order, joined. The patterns stay exactly as they
  were; a pattern that matched before a pure move still matches after it,
  and one that counts matches still counts across the whole loop. The
  component comes first and whole, as the checks always read it, so a check
  that slices between two markers in it still finds both there while they
  have not moved. The engine's files come with their comments taken out: a
  file there that only names a call in prose (pointer.ts's header names the
  block it came from) must not be read as the loop making that call, and a
  count of a statement must count statements, not their mentions.
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The repository's root, as the checks that read source use it: they run bundled
// from node_modules/.cache, so the module's own folder is not the repo's.
const ROOT = process.cwd();

function engineFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...engineFiles(p));
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** The visualizer component's text followed by every file under src/engine/. */
export function frameLoopSource() {
  const parts = [readFileSync(join(ROOT, 'src/components/LiquidVisualizer.tsx'), 'utf8')];
  for (const f of engineFiles(join(ROOT, 'src/engine'))) {
    parts.push(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'));
  }
  return parts.join('\n');
}
