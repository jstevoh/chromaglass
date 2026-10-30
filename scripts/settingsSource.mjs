/*
  The settings panel's source as the checks read it: `src/components/SettingsPanel.tsx`
  and the sections it was split into under `src/components/settings/` (PLAN 19ai-9).

  `panel`, `desklayout` and `rowfade` hold the panel to account by reading its
  markup as text, because node cannot render it: every `<Slider>` and the setting
  it writes, every `PinChips`, each section's `{keep(id) && (<section ...` and
  what the Mixer section hands the mixer. They were written when all of that was
  one 200 KB file. 19ai-9 moved each section's markup, verbatim, into a component
  of its own, so a check that kept reading SettingsPanel.tsx alone would find
  `<MasterSection c={c} />` where eighty sliders used to be and go red (`panel`
  stops at "the settings panel still has its sliders": 0 found), or, for a
  negative assertion, go on passing because the thing it forbids is no longer in
  the file it looks in.

  So a check reads the panel whole: SettingsPanel.tsx first, then each file under
  `settings/` in name order. A section moved as one block and kept its
  indentation, so a pattern that matched inside one section, or one slider, still
  matches; one that slices from a marker to the next `</section>` still finds both
  in one file, since no section was cut. The same shape as `appSource.mjs` (19ai-8).
*/
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The files, from the repository root: the panel, then `src/components/settings/*` by name. */
export function settingsFiles(root = process.env.INIT_CWD ?? process.cwd()) {
  const parts = readdirSync(join(root, 'src/components/settings')).filter(f => /\.tsx?$/.test(f)).sort().map(f => `src/components/settings/${f}`);
  return ['src/components/SettingsPanel.tsx', ...parts];
}

/** Their text, joined; `read` takes a path from the root (the check's own reader, so its root holds). */
export function settingsSource(read = (p) => readFileSync(join(process.env.INIT_CWD ?? process.cwd(), p), 'utf8')) {
  return settingsFiles().map(read).join('\n');
}

/*
  Whether a path under `src/` is one of the panel's parts. `panel`'s "every
  setting is read by something that renders" leaves the panel out as plumbing: a
  slider reads its own key to draw its handle, so counted as a reader the panel
  would pass every setting it draws, the fault that check was written to catch.
  Its sections are the same markup, so they are left out with it.
*/
export const isSettingsPart = (f) => f.replaceAll('\\', '/').startsWith('components/settings/');
