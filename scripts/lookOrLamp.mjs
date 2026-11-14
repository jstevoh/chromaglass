/*
  Does a line that quotes a retired look's id name the look, or something
  else that shares its word? `plate` 5b's question (PLAN 28i-5), in a module
  of its own so the check and its control read the same rule.

  Lumia was a look and is still the lamp's Lumia: a setting, a Mixer row and
  mover, a MIDI target, a desk pin, a ride. Some twenty lines in src/ and
  scripts/ quote the word for the lamp, and the look's retirement must not take
  the lamp with it. The first version of this listed the shapes of a look
  line (a stage's presetId, a contracts key, a look beside it) and passed
  everything else; the check-skeptic pass ran it over every live look as if
  each were retired and it passed 126 lines that plainly name a look
  (`PRESETS.find(p => p.id === …)`, `PRESET_AREAS[…]`, the app's
  `chromaglassApplyPreset?.(…)`, a song show's `{ kind: 'preset', id }`, the
  front page's featured looks, a one-look Set). So the test is the other way
  round: a line names the look unless it has the shape of the lamp, and a
  look's shape wins over the lamp's.

  The lamp's shapes: the setting's key (`settingKey=`, `key:`, `level:`,
  `setting:`), the types (`keyof VisualizerSettings`, `MixSource`,
  `MixMover`), the word read as a property or written as a bare key
  (a settings read, a patch's bare key), the remote's mix commands (mix-fade-…),
  a uniform's field (`{ name, type: 'f32' }`)
  the mixer's calls (`raiseMix(…)`, `fadeRow(…)`), or another setting key
  or mixer row quoted on the line or the line either side (a list of rows, a
  ride table, a uniform layout). What it cannot tell: a look line between two
  lamp lines with nothing of a look's shape on it reads as the lamp.
*/
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** True when lines[n], which quotes `id`, names the lamp (or other setting) and not the look. */
export function readsAsLamp(lines, n, id, lampNames, liveIds) {
  const line = lines[n];
  const w = esc(id), Q = `['"\`]${w}['"\`]`;
  const look = new RegExp(
    `PRESET\\w*\\s*[.[(]|findPreset\\s*\\(|livePresetId\\s*\\(|presetId\\s*[:=]|\\bid\\s*===?\\s*${Q}|` +
    `chromaglass\\w*(\\?\\.)?\\(\\s*${Q}|['"]?\\blook['"]?\\s*:\\s*${Q}|goTo\\s*\\(\\s*${Q}|kind:\\s*['"]preset['"]|\\bfrom\\s*:\\s*${Q}`);
  if (look.test(line)) return false;
  const others = liveIds.filter(i => i !== id);
  if (others.length && new RegExp(`['"\`](${others.map(esc).join('|')})['"\`]`).test(line)) return false;
  const lamp = new RegExp(
    `settingKey\\s*=\\s*${Q}|\\b(key|level|setting)\\s*:\\s*${Q}|keyof VisualizerSettings|\\bMix(Source|Mover)\\b|` +
    `\\.${w}\\b|\\bname\\s*:\\s*${Q}\\s*,\\s*type\\s*:|[{,]\\s*${w}\\s*:|['"\`]mix-[a-z]+-${w}['"\`]|\\w(Mix|Row|Blend|Fade)\\s*\\(\\s*${Q}`);
  if (lamp.test(line)) return true;
  const names = [...lampNames].filter(k => k !== id);
  const near = new RegExp(`['"\`](${names.map(esc).join('|')})['"\`]`);
  for (let k = Math.max(0, n - 1); k <= Math.min(lines.length - 1, n + 1); k++) if (near.test(lines[k])) return true;
  return false;
}
