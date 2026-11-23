/**
 * Calibrate, the song detector and Listen from the owner's assistant (PLAN
 * 44k-10): their lines in `npm run assistant`, kept beside
 * `scripts/assistant.mjs` because that file is close to the 100 KB `npm run
 * sizes` stops a file growing past.
 *
 * What it holds, read from what the stand-in display receives and from the
 * show's own answers, never from what the MCP server says it did:
 *  - calibrate, song_detection and listen reach the display as the ear's own
 *    presses, and show_state's ear reads back what they did (the detector,
 *    the room calibrating and then the floor and peak it found, Listen's
 *    phase and the song it was given);
 *  - calibrate with Auto Calibrate off is refused by the guard with the
 *    setting that turns it on, and nothing reaches the display (the ear does
 *    not calibrate then, so the press would restart it for nothing);
 *  - the detector takes a boolean only, and Name it a title and an artist
 *    both; anything else is refused and nothing reaches the display;
 *  - the display's own refusal (nothing heard to calibrate to; a cancel with
 *    Listen not listening) comes back to the assistant as the reason;
 *  - all of it needs Full, and a phone's `assistant-ear` never reaches the
 *    display.
 * Each rule has its mutant in EAR_MUTANTS, run with assistant.mjs's own.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The display's ear, as app/earNow.ts reports it and askEar answers. It
 * starts hearing nothing (room null), as the app does with no sound source,
 * and Listen's start opens the microphone when nothing is heard, as the
 * panel's does, so the room appears then, calibrating, and is calibrated
 * 300 ms later. A Name it is answered done whatever it carries: refusing a
 * half name is the guard's rule, measured here.
 */
export function standInEar() {
  const e = { detector: true, room: null, listen: { phase: 'idle', song: null, line: 'Press Listen while a song plays.' } };
  const calibrated = (sendState) => setTimeout(() => { if (e.room) { e.room = { calibrating: false, floorDb: -62, peakDb: -14 }; sendState(); } }, 300);
  return {
    state: () => ({ ...e, room: e.room && { ...e.room }, listen: { ...e.listen } }),
    onMessage(m, answer, sendState) {
      if (m.do === 'calibrate') {
        if (!e.room) { answer({ ok: false, reason: 'the stand-in display hears nothing to calibrate to' }); return; }
        e.room = { calibrating: true, floorDb: -40, peakDb: -40 };
        calibrated(sendState);
      }
      if (m.do === 'detector') e.detector = m.on;
      if (m.do === 'listen-start') {
        e.detector = true;
        e.listen = { phase: 'listening', song: null, line: 'Listening for the song…' };
        if (!e.room) { e.room = { calibrating: true, floorDb: -40, peakDb: -40 }; calibrated(sendState); }
      }
      if (m.do === 'listen-cancel') {
        if (e.listen.phase === 'idle') { answer({ ok: false, reason: 'the stand-in display\'s Listen is not listening' }); return; }
        e.listen = { phase: 'idle', song: null, line: 'Press Listen while a song plays.' };
      }
      if (m.do === 'listen-name') e.listen = { phase: 'listening', song: { title: m.title, artist: m.artist }, line: 'Listening for the song…' };
      answer({ ok: true });
      sendState();
    },
  };
}

const earOf = (st) => { try { return JSON.parse(st.text.slice(st.text.indexOf('\n{') + 1)).ear ?? null; } catch { return null; } };

/** In Play: refused for want of Full. */
export async function earPlayLines({ mcp, display, check }) {
  const t = Date.now();
  const r = [await mcp.call('calibrate', {}), await mcp.call('song_detection', { on: false }), await mcp.call('listen', { command: 'start' })];
  await sleep(150);
  check('ear-full', 'calibrate, song_detection and listen are refused in Play, for want of Full',
    r.every((x) => !x.ok && /Full mode is needed/.test(x.text)) && display.since(t, 'assistant-ear').length === 0, r.map((x) => x.text).join(' | ').slice(0, 160));
}

/** In Full: the rest. */
export async function earFullLines({ mcp, display, check, phone }) {
  const got = (t) => display.since(t, 'assistant-ear');
  const state = async () => earOf(await mcp.call('show_state'));

  // Nothing heard yet: the display's own refusal, as its reason.
  let t = Date.now();
  const deaf = await mcp.call('calibrate', {});
  await sleep(150);
  check('ear-answer', 'a calibrate with nothing heard reaches the display, and its refusal comes back to the assistant as the reason',
    !deaf.ok && /hears nothing to calibrate to/.test(deaf.text) && got(t).some((m) => m.do === 'calibrate'), deaf.text.slice(0, 140));

  // The detector, off and on, read back.
  t = Date.now();
  const off = await mcp.call('song_detection', { on: false });
  await sleep(250);
  const ear0 = await state();
  const bad = await mcp.call('song_detection', { on: 'off' });
  await sleep(150);
  check('-', 'song_detection off reaches the display as the detector\'s switch, and show_state\'s ear reads it off',
    off.ok && got(t).some((m) => m.do === 'detector' && m.on === false) && ear0?.detector === false, `${off.text} | ${JSON.stringify(ear0)}`.slice(0, 160));
  check('ear-bool', 'the detector takes true or false only: "off" is refused, and nothing reaches the display',
    !bad.ok && /true or false/.test(bad.text) && got(t).filter((m) => m.do === 'detector').length === 1, bad.text.slice(0, 140));

  // Listen: the detector comes on with it, and the room is heard.
  t = Date.now();
  const start = await mcp.call('listen', { command: 'start' });
  await sleep(150);
  const ear1 = await state();
  check('-', 'listen start reaches the display as Listen\'s press, and show_state\'s ear reads it listening, with the detector on and the room being calibrated',
    start.ok && got(t).some((m) => m.do === 'listen-start') && ear1?.listen?.phase === 'listening' && ear1.detector === true && ear1.room?.calibrating === true,
    `${start.text} | ${JSON.stringify(ear1)}`.slice(0, 200));

  // A name, half and whole.
  t = Date.now();
  const half = await mcp.call('listen', { command: 'name', title: 'Tiger Rag' });
  const blank = await mcp.call('listen', { command: 'name', title: '  ', artist: 'Original Dixieland Jass Band' });
  await sleep(150);
  check('ear-name', 'Name it without an artist, or with a blank title, is refused, and nothing reaches the display',
    !half.ok && !blank.ok && /title and its artist/.test(half.text) && got(t).length === 0, `${half.text} | ${blank.text}`.slice(0, 160));
  const whole = await mcp.call('listen', { command: 'name', title: '  Tiger Rag ', artist: 'Original Dixieland Jass Band' });
  await sleep(250);
  const ear2 = await state();
  check('-', 'Name it with both reaches the display trimmed, and show_state\'s ear.listen carries the song',
    whole.ok && got(t).some((m) => m.do === 'listen-name' && m.title === 'Tiger Rag' && m.artist === 'Original Dixieland Jass Band') && ear2?.listen?.song?.title === 'Tiger Rag',
    `${whole.text} | ${JSON.stringify(ear2?.listen)}`.slice(0, 200));

  // Calibrate, now that the room is heard, read back done with what it found.
  t = Date.now();
  const cal = await mcp.call('calibrate', {});
  await sleep(600);
  const ear3 = await state();
  check('-', 'calibrate reaches the display as Recalibrate room, and show_state\'s ear.room reads the floor and peak it found once it is done',
    cal.ok && got(t).some((m) => m.do === 'calibrate') && ear3?.room?.calibrating === false && ear3.room.floorDb === -62 && ear3.room.peakDb === -14,
    `${cal.text} | ${JSON.stringify(ear3?.room)}`.slice(0, 200));

  // Auto Calibrate off: the guard's refusal, nothing sent.
  const autoOff = await mcp.call('set', { settings: { autoCalibrate: false } });
  await sleep(150);
  t = Date.now();
  const noAuto = await mcp.call('calibrate', {});
  await sleep(150);
  check('ear-auto', 'with Auto Calibrate off, calibrate is refused with the setting that turns it on, and nothing reaches the display',
    autoOff.ok && !noAuto.ok && /Auto Calibrate is off/.test(noAuto.text) && /autoCalibrate/.test(noAuto.text) && got(t).length === 0, `${autoOff.text} | ${noAuto.text}`.slice(0, 160));
  await mcp.call('set', { settings: { autoCalibrate: true } });

  // Cancel, and cancel again: the display's refusal.
  t = Date.now();
  const cancel = await mcp.call('listen', { command: 'cancel' });
  const again = await mcp.call('listen', { command: 'cancel' });
  await sleep(150);
  check('ear-answer', 'listen cancel reaches the display, and a second one, with Listen not listening, comes back refused with the display\'s reason',
    cancel.ok && !again.ok && /not listening/.test(again.text) && got(t).filter((m) => m.do === 'listen-cancel').length === 2, `${cancel.text} | ${again.text}`.slice(0, 160));

  // A phone cannot.
  t = Date.now();
  phone.ws.send(JSON.stringify({ type: 'assistant-ear', do: 'detector', on: false }));
  phone.ws.send(JSON.stringify({ type: 'assistant-ear', do: 'calibrate' }));
  await sleep(300);
  check('phone-ear', 'a phone\'s assistant-ear never reaches the display', got(t).length === 0, got(t).map((x) => x.do).join(','));
}

/** The page's own half (app/earNow.ts `askEar`), whoever sent the message. */
export function earPageLines(page, say) {
  page.setCalibrateDoor(null); page.setDetectorDoor(null); page.setListenDoor(null);
  page.publishRoom(null);
  page.publishListen(true, 'idle', null, '');
  const none = [page.askEar({ do: 'calibrate' }), page.askEar({ do: 'detector', on: true }), page.askEar({ do: 'listen-start' })];
  say(/not running/.test(none[0] ?? '') && /not running/.test(none[1] ?? '') && /not running/.test(none[2] ?? ''), `with nothing mounted, the page's askEar says so (${none.join(' | ')})`);
  const did = [];
  page.setCalibrateDoor(() => did.push(['calibrate']));
  page.setDetectorDoor((on) => did.push(['detector', on]));
  page.setListenDoor({ start: () => did.push(['start']), cancel: () => did.push(['cancel']), tag: (a, b) => did.push(['tag', a, b]) });
  const r = [
    page.askEar({ do: 'calibrate' }),
    page.askEar({ do: 'detector', on: 'yes' }), page.askEar({ do: 'detector', on: false }),
    page.askEar({ do: 'listen-cancel' }),
    page.askEar({ do: 'listen-name', title: 'x' }), page.askEar({ do: 'listen-name', title: ' Wailana ', artist: ' Hawaiian ' }),
    page.askEar({ do: 'wobble' }),
  ];
  // The room heard, calibrating; and Listen listening.
  page.publishRoom({ floorDb: -50.4, peakDb: -20.6, progress: 0.2, calibrating: true, signal: true, sound: true });
  page.publishListen(true, 'listening', null, 'Listening for the song…');
  const r2 = [page.askEar({ do: 'calibrate' }), page.askEar({ do: 'listen-start' }), page.askEar({ do: 'listen-cancel' })];
  page.setCalibrateDoor(null); page.setDetectorDoor(null); page.setListenDoor(null);
  /* The room is copied when the calibration starts or ends, not on every
     reading: readings that only move the dB leave the copy (and so the remote
     state every phone is sent) as it was. */
  const room0 = page.readEar();
  page.publishRoom({ floorDb: -48, peakDb: -18, progress: 0.6, calibrating: true, signal: false, sound: false });
  page.publishRoom({ floorDb: -47, peakDb: -16, progress: 0.9, calibrating: true, signal: true, sound: true });
  const room1 = page.readEar();
  page.publishRoom({ floorDb: -61.6, peakDb: -13.6, progress: 1, calibrating: false, signal: true, sound: true });
  const room2 = page.readEar();
  page.publishRoom({ floorDb: -60, peakDb: -11, progress: 1, calibrating: false, signal: false, sound: false });
  const room3 = page.readEar();
  say(room1 === room0 && room1.room.floorDb === -50 && room2 !== room1 && room2.room.floorDb === -62 && room2.room.peakDb === -14 && !room2.room.calibrating && room3 === room2,
    `the page copies the room only when its calibration starts or ends, not on readings that move only the dB (${JSON.stringify([room0.room, room1.room, room2.room, room3.room])})`);
  const want = JSON.stringify([['detector', false], ['tag', 'Wailana', 'Hawaiian'], ['calibrate'], ['start'], ['cancel']]);
  say(/hears nothing/.test(r[0] ?? '') && /true or false/.test(r[1] ?? '') && r[2] === null && /not listening/.test(r[3] ?? '') && /title and its artist/.test(r[4] ?? '') && r[5] === null && /not one of/.test(r[6] ?? '')
    && r2.every((x) => x === null) && JSON.stringify(did) === want,
  `the page's askEar calibrates only with the room heard, takes the detector as a boolean, Name it with both names trimmed, and a cancel only while listening (${JSON.stringify(did)} ${JSON.stringify([...r, ...r2])})`.slice(0, 400));
}

export const EAR_MUTANTS = [
  { rule: 'ear-full', file: 'assistant.js', find: "if (type === 'assistant-ear') {\n        const why = needs(mode, 'full')", replace: "if (type === 'assistant-ear') {\n        const why = needs(mode, 'play')" },
  { rule: 'ear-auto', file: 'assistantEar.js', find: "if (settings && settings.autoCalibrate === false) return", replace: 'if (false) return' },
  { rule: 'ear-bool', file: 'assistantEar.js', find: "typeof message.on === 'boolean' ? { out: { do: 'detector'", replace: "true ? { out: { do: 'detector'" },
  { rule: 'ear-name', file: 'assistantEar.js', find: 'if (!title || !artist) return', replace: 'if (false) return' },
  { rule: 'ear-answer', file: 'assistant.js', find: "send({ type: 'assistant-ear', ...call.out, ...answerOf(message) });", replace: "send({ type: 'assistant-ear', ...call.out });" },
  { rule: 'phone-ear', file: 'remote-server.js', find: "new Set(['assistant-ear', 'cue-look',", replace: "new Set(['cue-look'," },
];
