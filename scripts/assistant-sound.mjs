/**
 * The microphone's input from the owner's assistant (PLAN 44k-12): its lines
 * in `npm run assistant`, kept beside `scripts/assistant.mjs` because that
 * file is close to the 100 KB `npm run sizes` stops a file growing past.
 *
 * What it holds, read from what the stand-in display receives and from the
 * show's own answers, never from what the MCP server says it did:
 *  - show_state's sound lists the inputs by the Sound panel's names, and the
 *    one chosen (null: the default microphone);
 *  - set_sound_source microphone with a device named in another case reaches
 *    the display as the name the display lists (the stand-in, like the
 *    page's soundNow, finds an input by that name, so a guard that passed
 *    the assistant's spelling through is seen), and show_state reads it back;
 *  - a name that is not an input is refused with the list, default
 *    included, and nothing reaches the display (the plan's pass line);
 *  - a device with any source but the microphone is refused, and nothing
 *    reaches the display;
 *  - the display's own refusal (an input listed in the guard's copy and
 *    unplugged since) comes back to the assistant as the reason;
 *  - default goes back to the default microphone.
 * Play's refusal is assistant.mjs's `fullonly`, a phone's `phone-live`.
 * Each rule here has its mutant in SOUND_MUTANTS, run with assistant.mjs's own.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INPUTS = ['MacBook Pro Microphone', 'Scarlett 2i2 USB', 'Old Interface'];

/**
 * The display's sound, as app/soundNow.ts reports it and askSound answers.
 * 'Old Interface' is listed and refused, as an interface unplugged since the
 * last state would be; an input is found by its listed name only.
 */
export function standInSound() {
  const s = { source: 'none', file: null, input: null, inputs: [...INPUTS] };
  return {
    state: () => ({ ...s, inputs: [...s.inputs] }),
    onMessage(m, answer, sendState) {
      if (m.device !== undefined && m.device !== 'default') {
        if (m.device === 'Old Interface' || !s.inputs.includes(m.device)) { answer({ ok: false, reason: `no microphone input "${m.device}" (the stand-in display has it unplugged)` }); return; }
      }
      if (m.device !== undefined) s.input = m.device === 'default' ? null : m.device;
      Object.assign(s, { source: m.source, file: null });
      answer({ ok: true });
      sendState();
    },
  };
}

const soundOf = (st) => { try { return JSON.parse(st.text.slice(st.text.indexOf('\n{') + 1)).sound ?? null; } catch { return null; } };

/** In Full. */
export async function soundFullLines({ mcp, display, check }) {
  const got = (t) => display.since(t, 'assistant-sound');
  const state = async () => soundOf(await mcp.call('show_state'));

  const s0 = await state();
  check('-', 'show_state\'s sound lists the microphone inputs by name, and none chosen (the default)',
    s0?.inputs?.join('|') === INPUTS.join('|') && s0.input === null, JSON.stringify(s0).slice(0, 160));

  let t = Date.now();
  const pick = await mcp.call('set_sound_source', { source: 'microphone', device: ' scarlett 2I2 usb' });
  await sleep(250);
  const s1 = await state();
  check('sound-device-name', 'set_sound_source microphone with an input named in another case reaches the display as the listed name, and show_state reads the source and the input back',
    pick.ok && got(t).some((m) => m.source === 'microphone' && m.device === 'Scarlett 2i2 USB') && s1?.source === 'microphone' && s1.input === 'Scarlett 2i2 USB',
    `${pick.text} | ${JSON.stringify(got(t))} | ${JSON.stringify(s1)}`.slice(0, 220));

  t = Date.now();
  const unknown = await mcp.call('set_sound_source', { source: 'microphone', device: 'Focusrite' });
  await sleep(150);
  check('sound-device', 'an input that is not there is refused with the list (default among it), and nothing reaches the display',
    !unknown.ok && /no microphone input "Focusrite"/.test(unknown.text) && /Scarlett 2i2 USB/.test(unknown.text) && /default\)/.test(unknown.text) && got(t).length === 0, unknown.text.slice(0, 180));

  t = Date.now();
  const wrong = await mcp.call('set_sound_source', { source: 'system', device: 'Scarlett 2i2 USB' });
  await sleep(150);
  check('sound-device-mic', 'a device with the system sound is refused (an input is the microphone\'s), and nothing reaches the display',
    !wrong.ok && /microphone's/.test(wrong.text) && got(t).length === 0, wrong.text.slice(0, 160));

  t = Date.now();
  const gone = await mcp.call('set_sound_source', { source: 'microphone', device: 'Old Interface' });
  await sleep(150);
  check('sound-device-answer', 'an input the guard\'s copy lists and the display has lost comes back refused with the display\'s reason',
    !gone.ok && /unplugged/.test(gone.text) && got(t).length === 1, gone.text.slice(0, 160));

  t = Date.now();
  const back = await mcp.call('set_sound_source', { source: 'microphone', device: 'Default' });
  await sleep(250);
  const s2 = await state();
  check('-', 'default goes back to the default microphone, and show_state reads input null',
    back.ok && got(t).some((m) => m.device === 'default') && s2?.input === null && s2.source === 'microphone', `${back.text} | ${JSON.stringify(s2)}`.slice(0, 180));
}

/** The page's own half (app/soundNow.ts `askSound`, `publishInputs`), whoever sent the message. */
export async function soundPageLines(page, say) {
  page.publishInputs([{ id: 'id-mac', label: 'MacBook Pro Microphone' }, { id: 'id-usb', label: 'Scarlett 2i2 USB' }], 'id-usb');
  const read = page.readSound();
  const did = [];
  // The door settles with why the source did not open (getUserMedia's refusal), and that is the answer.
  page.setSoundDoor(async (s, d) => { did.push([s, d ?? null]); return did.length === 3 ? 'the microphone did not open' : null; });
  const r = await Promise.all([
    page.askSound('microphone', 'scarlett 2i2 usb'), page.askSound('microphone', 'default'), page.askSound('microphone', 'Focusrite'),
    page.askSound('system', 'Scarlett 2i2 USB'), page.askSound('microphone', ''), page.askSound('microphone'),
  ]);
  page.publishInputs([{ id: 'id-mac', label: 'MacBook Pro Microphone' }, { id: 'id-usb', label: 'Scarlett 2i2 USB' }], 'id-usb');
  const same = page.readSound() === read;
  page.publishInputs([{ id: 'id-mac', label: 'MacBook Pro Microphone' }], 'id-usb');
  const unplugged = page.readSound();
  const after = await page.askSound('microphone', 'Scarlett 2i2 USB');
  page.setSoundDoor(null);
  const want = JSON.stringify([['microphone', 'id-usb'], ['microphone', ''], ['microphone', null]]);
  say(read.input === 'Scarlett 2i2 USB' && read.inputs.join('|') === 'MacBook Pro Microphone|Scarlett 2i2 USB' && r[0] === null && r[1] === null
    && /no microphone input "Focusrite" \(there are: MacBook Pro Microphone, Scarlett 2i2 USB, default\)/.test(r[2] ?? '') && /microphone's/.test(r[3] ?? '') && /no microphone input/.test(r[4] ?? '') && /did not open/.test(r[5] ?? '')
    && same && unplugged.input === null && unplugged.inputs.length === 1 && /no microphone input/.test(after ?? '') && JSON.stringify(did) === want,
  `the page's askSound finds an input by name in any case and hands its door the id ('' for default), refuses a name not listed with the list, a device off the microphone and a blank one, answers with the door's word when the source did not open, keeps one copy while nothing moved, and reads an input unplugged as none chosen (${JSON.stringify(did)} ${JSON.stringify(r)} ${after})`.slice(0, 460));
}

export const SOUND_MUTANTS = [
  { rule: 'sound-device', file: 'assistantSound.js', find: 'if (hit === undefined) return', replace: 'if (false) return' },
  { rule: 'sound-device-name', file: 'assistantSound.js', find: 'return { device: hit };', replace: 'return { device: d };' },
  { rule: 'sound-device-mic', file: 'assistantSound.js', find: "if (message.source !== 'microphone') return", replace: 'if (false) return' },
  { rule: 'sound-device-answer', file: 'assistant.js', find: "{ device: dev.device }), ...answerOf(message) });", replace: "{ device: dev.device }) });" },
];
