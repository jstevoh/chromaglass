/**
 * The outputs from the owner's assistant (PLAN 44k-14): OSC out, OSC in, MIDI
 * and Syphon, the relay's and the guard's rules for `assistant-outputs`.
 *
 * Asked as part of the owner's goal of 2026-11-09, complete control of the
 * show from Claude. The four live in three different places, and the call
 * goes to the one that owns each, so nothing here keeps a second copy of a
 * switch the desk also shows:
 *
 *  - OSC out is the show server's socket, but the switch is the page's
 *    (app/useShowFeed.ts keeps the performer's choice, and asks a server that
 *    restarts to open it again), so `osc-out` goes to the display, which
 *    flips the same switch the Sound panel's row does. Sent from here
 *    straight to the socket, the page would not know, and the next server
 *    restart would put back what the page remembered.
 *  - MIDI is the page's (Web MIDI, hooks/useMidi.ts), so `midi` goes to the
 *    display too: on or off and its two ports, by the names the MIDI panel
 *    shows. Learning a control stays the person's: it needs a hand on the
 *    controller, and an assistant that "learned" one would be guessing.
 *  - OSC in is the show server's socket and, in the Mac app, the Show menu's
 *    choice (desktop/main.js `setOscMode`, kept in show.json), so `osc-in` is
 *    answered by the relay at once, through the Mac app's hook when it handed
 *    one (`setAppOutputs`), else through the server's own socket (a show run
 *    from a terminal, where nothing keeps the choice past a restart).
 *  - Syphon is the Mac app's main process's (PLAN 13.2, its own thread), so
 *    `syphon` is answered from the Mac app's hook as well, through the Show
 *    menu's own item, and a build without Syphon says so.
 *  - `status` reads OSC in and Syphon, in any mode: it changes nothing. OSC
 *    out and MIDI the display reports in its state, so show_state has them.
 *
 * OSC in and Syphon are switches, not moves on the plate, so the relay answers
 * them without the guard's pace (the room's setting, made once, as the Mac
 * menu's is). Their `oscIn.mode` is the choice: in the Mac app the menu's, and
 * from a terminal the socket's, so a port another program holds reads as the
 * menu's choice with `socket` `off (EADDRINUSE)` on the Mac, and as off from a
 * terminal, where nothing else keeps the choice.
 *
 * Everything that changes an output is Full: OSC in opens the show to other
 * programs (and to the network), OSC out and Syphon send the show to them,
 * and MIDI takes a controller's hand; the room's, as the room's settings are.
 * Why beside assistant.js and not in it: that file is past the 40 KB line
 * `npm run sizes` warns at (as assistantEar.js and assistantMedia.js are).
 */

/** What the relay answers itself, never sent to the display. */
export const RELAY_OUTPUTS = ['status', 'osc-in', 'syphon'];
/** What the guard sends the display. */
export const DISPLAY_OUTPUTS = ['osc-out', 'midi'];
/** OSC in's choices, the Show menu's words: off, this Mac only, the network. */
export const OSC_IN_MODES = ['off', 'local', 'network'];
export const OSC_IN_BINDS = { local: '127.0.0.1', network: '0.0.0.0' };

const RANK = { off: 0, suggest: 1, play: 2, full: 3 };
const full = (mode, what) => ((RANK[mode] ?? 0) < RANK.full ? `Full mode is needed (the show is in ${mode}): ${what}` : null);

/**
 * "address:port", as the Sound panel's OSC out row takes it (lib/oscOut.ts
 * `oscOutTarget`, the same pattern, so the guard never passes what the page
 * would refuse): an IPv4 address or localhost.
 */
export function oscTarget(text) {
  const m = /^\s*(localhost|\d{1,3}(?:\.\d{1,3}){3})\s*:\s*(\d{1,5})\s*$/.exec(typeof text === 'string' ? text : '');
  if (!m) return null;
  const host = m[1] === 'localhost' ? '127.0.0.1' : m[1];
  if (host.split('.').some((o) => Number(o) > 255)) return null;
  const port = Number(m[2]);
  return port >= 1 && port <= 65535 ? `${host}:${port}` : null;
}

/** The OSC-in choice a socket's words say (remote-server.js `oscState`): `off`, `off (EADDRINUSE)` or `udp host:port`. */
export function oscInMode(state) {
  const m = /^udp ([\d.]+):\d+$/.exec(String(state ?? ''));
  if (!m) return 'off';
  return m[1] === OSC_IN_BINDS.local ? 'local' : 'network';
}

/** The relay's answer to one `assistant-outputs` it owns: `{ ok, reason?, outputs? }`. Async, since a socket takes a moment to bind. */
export async function outputsCall(message, mode, hook) {
  const d = message?.do;
  if (!RELAY_OUTPUTS.includes(d)) return { ok: false, reason: `outputs: ${[...RELAY_OUTPUTS, ...DISPLAY_OUTPUTS].join(', ')}, not ${String(d)}` };
  if (!hook) return { ok: false, reason: 'the show server has no outputs to report' };
  if (d === 'status') return { ok: true, outputs: hook.state() };
  const why = full(mode, d === 'osc-in' ? 'OSC in lets other programs drive the show' : 'Syphon sends the show to other programs');
  if (why) return { ok: false, reason: why };
  if (d === 'osc-in') {
    if (!OSC_IN_MODES.includes(message.mode)) return { ok: false, reason: `osc-in: mode ${OSC_IN_MODES.join(', ')} (local: this Mac only), not ${String(message.mode)}` };
    const said = await hook.setOscIn(message.mode);
    // A port another program holds: the choice is made, the socket is not open, and the assistant hears it.
    if (message.mode !== 'off' && !/^udp /.test(said ?? '')) return { ok: false, reason: `OSC in could not open its port: ${said ?? 'no socket'}. Another program may be using it`, outputs: hook.state() };
    return { ok: true, outputs: hook.state() };
  }
  if (typeof message.on !== 'boolean') return { ok: false, reason: 'syphon: on, as true or false' };
  const no = hook.setSyphon ? hook.setSyphon(message.on) : 'Syphon is the Mac app\'s, and this show is not running in it';
  if (no) return { ok: false, reason: no, outputs: hook.state() };
  return { ok: true, outputs: hook.state() };
}

/**
 * The guard's copy of the display's MIDI ports, by the MIDI panel's names
 * (null from a display one build older, which then judges a name itself).
 */
export function midiPortsOf(outputs) {
  const m = outputs && typeof outputs === 'object' ? outputs.midi : null;
  if (!m || typeof m !== 'object') return null;
  return {
    inputs: Array.isArray(m.inputs) ? m.inputs.map(String) : [],
    outputs: Array.isArray(m.outputs) ? m.outputs.map(String) : [],
  };
}

/** A port by name in any case, or one of the words that are no single port. */
function port(name, list, words, what) {
  const want = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (words.includes(want)) return { name: want };
  if (!want) return { reason: `${what}: a name from show_state's outputs.midi.${what}s, or ${words.join(' or ')}` };
  if (!list) return { name };
  const hit = list.find((n) => n === name) ?? list.find((n) => n.trim().toLowerCase() === want);
  return hit === undefined ? { reason: `no MIDI ${what} "${name}" (there are: ${[...list, ...words].join(', ')})` } : { name: hit };
}

/**
 * The guard's answer for one `assistant-outputs` the display carries out:
 * what to send it, or why not. Full is the caller's (assistant.js), as the
 * pacing is.
 */
export function outputsGuard(message, midiPorts) {
  const d = message?.do;
  if (d === 'osc-out') {
    if (typeof message.on !== 'boolean') return { reason: 'osc-out: on, as true or false' };
    if (message.target === undefined) return { out: { do: d, on: message.on } };
    const target = oscTarget(message.target);
    if (!target) return { reason: `osc-out: target as address:port (an IPv4 address or localhost, as 127.0.0.1:7000), not ${String(message.target)}` };
    return { out: { do: d, on: message.on, target } };
  }
  if (d === 'midi') {
    const out = { do: d };
    if (message.on !== undefined) {
      if (typeof message.on !== 'boolean') return { reason: 'midi: on, as true or false' };
      out.on = message.on;
    }
    if (message.input !== undefined) {
      const p = port(message.input, midiPorts?.inputs, ['all'], 'input');
      if (p.reason) return p;
      out.input = p.name;
    }
    if (message.output !== undefined) {
      const p = port(message.output, midiPorts?.outputs, ['auto', 'off'], 'output');
      if (p.reason) return p;
      out.output = p.name;
    }
    if (Object.keys(out).length === 1) return { reason: 'midi: on, input or output' };
    return { out };
  }
  return { reason: `outputs: ${[...RELAY_OUTPUTS, ...DISPLAY_OUTPUTS].join(', ')}, not ${String(d)}` };
}
