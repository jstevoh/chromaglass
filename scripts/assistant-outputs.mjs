/**
 * OSC out, OSC in, MIDI and Syphon from the owner's assistant (PLAN 44k-14):
 * their lines in `npm run assistant`, beside `scripts/assistant.mjs` because
 * that file is close to the 100 KB `npm run sizes` stops a file growing past.
 *
 * What it holds, read from what the stand-in display receives, from the show
 * server's own OSC socket and from the show's answers, never from what the
 * MCP server says it did:
 *  - in Play every change is refused for want of Full and nothing reaches the
 *    display; status is answered;
 *  - show_state's outputs carries the display's OSC out and MIDI and the
 *    relay's OSC in and Syphon (null: a show with no Mac app has none);
 *  - osc_out reaches the display with its target in the page's own form
 *    (localhost as 127.0.0.1, the spaces gone), and a target that is not
 *    address:port is refused with nothing sent;
 *  - midi's ports reach the display as the names the display lists, found
 *    in any case; a name not listed is refused with the list, its words
 *    included; the display's own refusal comes back as the reason;
 *  - osc_in opens the server's own socket on this Mac only (127.0.0.1) or
 *    the network (0.0.0.0) and closes it, never through the display; a mode
 *    that is not one of the three is refused; a port another program holds
 *    is refused with the socket's words, not claimed open;
 *  - syphon, in a show not run in the Mac app, says it has none;
 *  - a phone's assistant-outputs never reaches the display.
 * The Mac app's half (the Show menu's choice kept and ticked when the
 * assistant makes it) is `npm run desktop`'s OSC block.
 * Each rule here has its mutant in OUTPUTS_MUTANTS, run with assistant.mjs's own.
 */
import { createSocket } from 'node:dgram';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The UDP port the check's show server opens OSC in on (its CHROMAGLASS_OSC_PORT): beside its own TCP port. */
export const oscPort = (port) => port + 7;

const MIDI_IN = ['APC40 mkII', 'Launch Control XL'];

/**
 * The display's outputs, as app/outputsNow.ts reports them and askOutputs
 * answers. 'Launch Control XL' is listed and refused, as a controller
 * unplugged since the last state would be.
 */
export function standInOutputs() {
  const o = {
    oscOut: { on: false, target: '127.0.0.1:7000', pro: true, says: 'off' },
    midi: { supported: true, on: false, open: false, error: null, inputs: [...MIDI_IN], outputs: ['APC40 mkII'], input: 'all', output: 'auto', clocked: false, map: { name: 'My controller', bindings: 3 } },
  };
  return {
    state: () => JSON.parse(JSON.stringify(o)),
    onMessage(m, answer, sendState) {
      if (m.do === 'osc-out') Object.assign(o.oscOut, { on: m.on, ...(m.target ? { target: m.target } : {}), says: m.on ? `udp ${m.target ?? o.oscOut.target}` : 'off' });
      if (m.do === 'midi') {
        if (m.input === 'Launch Control XL') { answer({ ok: false, reason: 'no MIDI input "Launch Control XL" (the stand-in display has it unplugged)' }); return; }
        if (typeof m.on === 'boolean') Object.assign(o.midi, { on: m.on, open: m.on });
        if (m.input) o.midi.input = m.input;
        if (m.output) o.midi.output = m.output;
      }
      answer({ ok: true });
      sendState();
    },
  };
}

const outputsOf = (st) => { try { return JSON.parse(st.text.slice(st.text.indexOf('\n{') + 1)).outputs ?? null; } catch { return null; } };
const dataOf = (r) => { try { return JSON.parse(r.text.slice(r.text.indexOf('\n{') + 1)); } catch { return null; } };

/** In Play: every change refused for want of Full, nothing at the display; status answered. */
export async function outputsPlayLines({ mcp, display, check }) {
  const t = Date.now();
  const r = [
    await mcp.call('outputs', { command: 'osc_out', on: true }), await mcp.call('outputs', { command: 'midi', on: true }),
    await mcp.call('outputs', { command: 'osc_in', mode: 'network' }), await mcp.call('outputs', { command: 'syphon', on: true }),
  ];
  const st = await mcp.call('outputs', { command: 'status' });
  await sleep(150);
  check('outputs-full', 'outputs osc_out and midi are refused in Play, for want of Full, and nothing reaches the display',
    r.slice(0, 2).every((x) => !x.ok && /Full mode is needed/.test(x.text)) && display.since(t, 'assistant-outputs').length === 0, r.slice(0, 2).map((x) => x.text).join(' | ').slice(0, 200));
  check('outputs-relay-full', 'outputs osc_in and syphon are refused in Play too; status is not',
    r.slice(2).every((x) => !x.ok && /Full mode is needed/.test(x.text)) && st.ok && /"oscIn"/.test(st.text), [...r.slice(2), st].map((x) => x.text).join(' | ').slice(0, 200));
}

/** In Full. */
export async function outputsFullLines({ mcp, display, check, phone, port }) {
  const got = (t) => display.since(t, 'assistant-outputs');
  const state = async () => outputsOf(await mcp.call('show_state'));
  const udp = oscPort(port);

  const s0 = await state();
  check('-', 'show_state\'s outputs carries the display\'s OSC out and MIDI (ports by name) and the relay\'s OSC in (off) and Syphon (none here)',
    s0?.oscOut?.target === '127.0.0.1:7000' && s0.midi?.inputs?.join('|') === MIDI_IN.join('|') && s0.oscIn?.mode === 'off' && s0.oscIn.socket === 'off' && s0.syphon === null, JSON.stringify(s0).slice(0, 220));

  let t = Date.now();
  const on = await mcp.call('outputs', { command: 'osc_out', on: true, target: ' localhost : 7001' });
  await sleep(250);
  const s1 = await state();
  check('outputs-target', 'osc_out on reaches the display with its target in the page\'s form (127.0.0.1:7001), and show_state reads it back',
    on.ok && got(t).some((m) => m.do === 'osc-out' && m.on === true && m.target === '127.0.0.1:7001') && s1?.oscOut?.on === true && s1.oscOut.target === '127.0.0.1:7001',
    `${on.text} | ${JSON.stringify(got(t))} | ${JSON.stringify(s1?.oscOut)}`.slice(0, 220));

  t = Date.now();
  const bad = await mcp.call('outputs', { command: 'osc_out', on: true, target: 'example.com:7000' });
  await sleep(150);
  check('outputs-target-bad', 'a target that is not address:port is refused, and nothing reaches the display',
    !bad.ok && /address:port/.test(bad.text) && got(t).length === 0, bad.text.slice(0, 160));

  t = Date.now();
  const pick = await mcp.call('outputs', { command: 'midi', on: true, input: ' apc40 MKII', output: 'OFF' });
  await sleep(250);
  const s2 = await state();
  check('outputs-midi-name', 'midi on with an input named in another case reaches the display as the listed name (and the output\'s word as itself), and show_state reads it back',
    pick.ok && got(t).some((m) => m.do === 'midi' && m.on === true && m.input === 'APC40 mkII' && m.output === 'off') && s2?.midi?.on === true && s2.midi.input === 'APC40 mkII' && s2.midi.output === 'off',
    `${pick.text} | ${JSON.stringify(got(t))} | ${JSON.stringify(s2?.midi)}`.slice(0, 240));

  t = Date.now();
  const unknown = await mcp.call('outputs', { command: 'midi', input: 'Novation' });
  await sleep(150);
  check('outputs-midi-port', 'a MIDI input that is not there is refused with the list (all among it), and nothing reaches the display',
    !unknown.ok && /no MIDI input "Novation"/.test(unknown.text) && /Launch Control XL, all\)/.test(unknown.text) && got(t).length === 0, unknown.text.slice(0, 180));

  t = Date.now();
  const gone = await mcp.call('outputs', { command: 'midi', input: 'Launch Control XL' });
  await sleep(150);
  check('outputs-answer', 'a MIDI input the guard\'s copy lists and the display has lost comes back refused with the display\'s reason',
    !gone.ok && /unplugged/.test(gone.text) && got(t).length === 1, gone.text.slice(0, 160));

  t = Date.now();
  const local = await mcp.call('outputs', { command: 'osc_in', mode: 'local' });
  const sLocal = await state();
  const net = await mcp.call('outputs', { command: 'osc_in', mode: 'network' });
  const off = await mcp.call('outputs', { command: 'osc_in', mode: 'off' });
  await sleep(150);
  const [dl, dn, doff] = [local, net, off].map((x) => dataOf(x)?.oscIn);
  check('outputs-oscin', 'osc_in opens the show server\'s socket for this Mac only (127.0.0.1) or the network (0.0.0.0) and closes it, show_state reads it, and none of it goes to the display',
    local.ok && net.ok && off.ok && dl?.mode === 'local' && dl.socket === `udp 127.0.0.1:${udp}` && sLocal?.oscIn?.mode === 'local' && dn?.mode === 'network' && dn.socket === `udp 0.0.0.0:${udp}` && doff?.socket === 'off' && got(t).length === 0,
    `${JSON.stringify(dl)} | ${JSON.stringify(dn)} | ${JSON.stringify(doff)} | ${local.ok ? '' : local.text}`.slice(0, 240));

  const wrong = await mcp.call('outputs', { command: 'osc_in', mode: 'everyone' });
  check('outputs-oscin-mode', 'an OSC-in mode that is not off, local or network is refused, and the socket stays shut',
    !wrong.ok && /mode off, local, network/.test(wrong.text) && dataOf(await mcp.call('outputs', { command: 'status' }))?.oscIn?.socket === 'off', wrong.text.slice(0, 160));

  // Another program holds the port (a plain socket, no SO_REUSEADDR, which the show's socket then cannot share).
  // A socket the show left open (a broken mode rule) makes this bind fail: that must end the line, not hang it.
  const holder = createSocket('udp4');
  const held = await new Promise((r) => { holder.once('error', () => r(false)); holder.bind(udp, '127.0.0.1', () => r(true)); });
  const taken = await mcp.call('outputs', { command: 'osc_in', mode: 'local' });
  holder.close();
  check('outputs-oscin-taken', 'a port another program holds is refused with the socket\'s words, not claimed open',
    held && !taken.ok && /could not open its port: off \(/.test(taken.text), `${held ? '' : 'the port was not free to hold | '}${taken.text}`.slice(0, 160));
  await mcp.call('outputs', { command: 'osc_in', mode: 'off' });

  const sy = await mcp.call('outputs', { command: 'syphon', on: true });
  check('-', 'syphon in a show not run in the Mac app says it has none', !sy.ok && /Mac app's/.test(sy.text), sy.text.slice(0, 160));

  t = Date.now();
  phone.ws.send(JSON.stringify({ type: 'assistant-outputs', do: 'osc-out', on: true, target: '10.0.0.9:9999' }));
  phone.ws.send(JSON.stringify({ type: 'assistant-outputs', do: 'osc-in', mode: 'network' }));
  await sleep(250);
  check('phone-outputs', 'a phone\'s assistant-outputs never reaches the display, nor opens OSC in',
    got(t).length === 0 && dataOf(await mcp.call('outputs', { command: 'status' }))?.oscIn?.socket === 'off');
}

/** The page's own half (app/outputsNow.ts), whoever sent the message. */
export async function outputsPageLines(page, say) {
  const ins = [{ id: 'in-apc', name: 'APC40 mkII' }, { id: 'in-lcx', name: 'Launch Control XL' }], outs = [{ id: 'out-apc', name: 'APC40 mkII' }];
  const midi = (over = {}) => ({ supported: true, enabled: true, open: true, error: null, inputs: ins, outputs: outs, ports: { input: 'in-lcx', output: 'off' }, clocked: false, map: { name: 'Mine', bindings: [1, 2] }, ...over });
  page.publishOscOut({ on: false, target: '127.0.0.1:7000', pro: true, says: 'off' });
  page.publishMidi(midi());
  const read = page.readOutputs();
  page.publishMidi(midi());
  const same = page.readOutputs() === read;
  const did = [];
  page.setOscOutDoor((on, target) => { did.push(['osc', on, target ?? null]); return target !== 'nope'; });
  page.setMidiDoor(async (want) => { did.push(['midi', want]); return null; });
  const r = [
    await page.askOutputs({ do: 'osc-out', on: true, target: '127.0.0.1:7001' }), await page.askOutputs({ do: 'osc-out', on: true, target: 'nope' }),
    await page.askOutputs({ do: 'midi', input: 'apc40 mkii', output: 'auto' }), await page.askOutputs({ do: 'midi', input: 'Novation' }), await page.askOutputs({ do: 'midi' }),
  ];
  page.setOscOutDoor(null); page.setMidiDoor(null);
  const want = JSON.stringify([['osc', true, '127.0.0.1:7001'], ['osc', true, 'nope'], ['midi', { input: 'in-apc', output: 'auto' }]]);
  say(read.midi?.input === 'Launch Control XL' && read.midi.output === 'off' && read.midi.inputs.join('|') === 'APC40 mkII|Launch Control XL' && read.midi.map.bindings === 2 && same
    && r[0] === null && /address:port/.test(r[1] ?? '') && r[2] === null && /no MIDI input "Novation" \(there are: APC40 mkII, Launch Control XL, all\)/.test(r[3] ?? '') && /on, input or output/.test(r[4] ?? '') && JSON.stringify(did) === want,
  `the page's askOutputs flips OSC out through its door and refuses a target the door refuses, finds a MIDI port by name in any case and hands its door the id, refuses a name not listed with the list, and keeps one copy while nothing moved (${JSON.stringify(did)} ${JSON.stringify(r)})`.slice(0, 460));

  // Switching on settles once Web MIDI answered: open, refused, or not in time; an old error is not the answer.
  const fake = (steps) => { let i = 0; const m = { enabled: false, open: false, error: 'from before', calls: [], enable() { m.calls.push('on'); }, disable() { m.calls.push('off'); }, choosePorts(p) { m.calls.push(p); } }; return { m, read: () => Object.assign(m, steps[Math.min(i++, steps.length - 1)]) }; };
  const opens = fake([{ enabled: false }, { enabled: true, error: null }, { enabled: true, open: true, error: null }]);
  const refused = fake([{ enabled: false }, { enabled: true, error: null }, { enabled: false, error: 'MIDI access was refused.' }]);
  // Refused before the first look: on and off again inside 100 ms, as an already denied permission is.
  const fast = fake([{ enabled: false }, { enabled: false, error: 'Permission denied.' }]);
  const slow = fake([{ enabled: true, error: null }]);
  const a = [await page.midiDoorOf(opens.read)({ on: true }), await page.midiDoorOf(refused.read)({ on: true }), await page.midiDoorOf(slow.read, 300)({ on: true }), await page.midiDoorOf(opens.read)({ on: false, output: 'off' }), await page.midiDoorOf(fast.read)({ on: true })];
  say(a[0] === null && /did not open: MIDI access was refused/.test(a[1] ?? '') && /did not open in 0.3 s/.test(a[2] ?? '') && a[3] === null && /did not open: Permission denied/.test(a[4] ?? '') && opens.m.calls.join(',') === 'on,[object Object],off',
    `the page's MIDI door answers once Web MIDI opened, with the browser's refusal when it did not (one that lands before the first look too, not a wait), and says so when it did not answer in time (${JSON.stringify(a)} ${JSON.stringify(opens.m.calls)})`);
}

export const OUTPUTS_MUTANTS = [
  { rule: 'outputs-full', file: 'assistant.js', find: "if (type === 'assistant-outputs') {\n        const why = needs(mode, 'full') ?? paced('patch', mode, t);", replace: "if (type === 'assistant-outputs') {\n        const why = paced('patch', mode, t);" },
  { rule: 'outputs-relay-full', file: 'assistantOutputs.js', find: "if (d === 'status') return { ok: true, outputs: hook.state() };\n  const why = full(", replace: "if (d === 'status') return { ok: true, outputs: hook.state() };\n  const why = null && full(" },
  { rule: 'outputs-target', file: 'assistantOutputs.js', find: 'return { out: { do: d, on: message.on, target } };', replace: 'return { out: { do: d, on: message.on, target: message.target } };' },
  { rule: 'outputs-target-bad', file: 'assistantOutputs.js', find: 'if (!target) return', replace: 'if (false) return' },
  { rule: 'outputs-midi-name', file: 'assistantOutputs.js', find: ': { name: hit };', replace: ': { name };' },
  { rule: 'outputs-midi-port', file: 'assistantOutputs.js', find: 'return hit === undefined ?', replace: 'return false ?' },
  { rule: 'outputs-answer', file: 'assistant.js', find: "send({ type: 'assistant-outputs', ...call.out, ...answerOf(message) });", replace: "send({ type: 'assistant-outputs', ...call.out });" },
  { rule: 'outputs-oscin', file: 'remote-server.js', find: "setOsc(mode === 'off' ? 0 : OSC_ON_PORT, OSC_IN_BINDS[mode])", replace: "setOsc(mode === 'off' ? 0 : OSC_ON_PORT, '0.0.0.0')" },
  { rule: 'outputs-oscin-mode', file: 'assistantOutputs.js', find: 'if (!OSC_IN_MODES.includes(message.mode)) return', replace: 'if (false) return' },
  { rule: 'outputs-oscin-taken', file: 'assistantOutputs.js', find: "if (message.mode !== 'off' && !/^udp /.test(said ?? ''))", replace: 'if (false)' },
  { rule: 'phone-outputs', file: 'remote-server.js', find: "'cue-look', 'assistant-outputs', 'assistant-live',", replace: "'cue-look', 'assistant-live'," },
];
