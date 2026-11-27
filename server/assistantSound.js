/**
 * The microphone's input for the owner's assistant (PLAN 44k-12): the
 * guard's rule for an `assistant-sound` that names a device.
 *
 * Why beside `assistant.js` and not in it: that file is past the 40 KB line
 * `npm run sizes` warns at, so each new piece of the guard goes in a module
 * of its own (as assistantRecord.js did).
 *
 * What was missing: `set_sound_source microphone` opened whatever input the
 * Sound panel's picker last held, and nothing the assistant could read said
 * which inputs there were. On a stage the input is the whole question (a
 * USB interface fed from the sound desk, not the laptop hearing the room),
 * so the owner asking for "the Scarlett" had no way through.
 *
 * The display reports its inputs by the picker's own names (state
 * `sound.inputs`, app/soundNow.ts), and `device` is one of those names, in
 * any case, or `default` for the picker's "Default microphone". Judged here
 * on the guard's copy, so a name that is not there is refused with the list
 * where the assistant hears it, rather than dropped by the page in silence;
 * the page judges again on its own list (an interface unplugged between the
 * copy and the call), and its answer comes back. A device goes with the
 * microphone only: "system, on the Scarlett" is a mistake to say back, not a
 * choice to half-make. Null from a display one build older: the page's own
 * check is then the only one.
 */

export const DEFAULT_INPUT = 'default';

/** The guard's copy of the display's inputs, by name. */
export function inputsOf(sound) {
  return sound && typeof sound === 'object' && Array.isArray(sound.inputs) ? sound.inputs.map(String) : null;
}

/** The device to send the display: the name as the display lists it, or why not. */
export function soundDevice(message, inputs) {
  const d = message.device;
  if (message.source !== 'microphone') return { reason: `an input is the microphone's: source ${String(message.source)} takes none` };
  const want = typeof d === 'string' ? d.trim().toLowerCase() : '';
  if (!want) return { reason: 'device: a name from show_state\'s sound.inputs, or default' };
  if (want === DEFAULT_INPUT || !inputs) return { device: want === DEFAULT_INPUT ? DEFAULT_INPUT : d };
  const hit = inputs.find((n) => n === d) ?? inputs.find((n) => n.trim().toLowerCase() === want);
  if (hit === undefined) return { reason: `no microphone input "${d}" (there are: ${[...inputs, DEFAULT_INPUT].join(', ')})` };
  return { device: hit };
}
