/**
 * The projector from the owner's assistant (PLAN 44k-15): its lines in
 * `npm run assistant`, beside `scripts/assistant.mjs` because that file is
 * close to the 100 KB `npm run sizes` stops a file growing past.
 *
 * What it holds, read from what the stand-in display receives and from the
 * show's answers, never from what the MCP server says it did:
 *  - in Play every call is refused for want of Full and nothing reaches the
 *    display;
 *  - show_state's projector carries the display's cast (the screen found,
 *    the mode, whether the window is open) and its wall (geometry, grade, the
 *    flash guard, the shapes counted, the test card);
 *  - cast, mode, test and identify reach the display as themselves, and a
 *    mode that is not ask, auto or off is refused with nothing sent;
 *  - the display's own refusal (a window the browser blocked) comes back as
 *    the reason, not as done;
 *  - wall reaches the display with only the keys named, in the page's own
 *    names, and show_state reads them back; reset reaches it as wall-reset;
 *  - corners that fold the picture, put most of it off the screen or shrink
 *    it to a dot are refused, each with its own words, and so is a number out
 *    of its range, with nothing sent;
 *  - the flash guard can be turned on and never off;
 *  - a phone's assistant-projector never reaches the display.
 * The page's own half (app/projectorNow.ts) is `projectorPageLines`, on the
 * real module. Each rule has its mutant in PROJECTOR_MUTANTS, run with
 * assistant.mjs's own.
 */

import { readFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SQUARE = [0, 0, 1, 0, 1, 1, 0, 1];
const KEYSTONE = [0.06, 0.02, 0.95, 0, 1, 1, 0, 0.97];

/**
 * The display's projector, as app/projectorNow.ts reports it and
 * askProjector answers. Its first cast is refused with the page's words for a
 * blocked window, as a browser that no click opened it in would.
 */
export function standInProjector() {
  let blocked = true;
  const fresh = () => ({ flipX: false, flipY: false, corners: [...SQUARE], maskTop: 0, maskRight: 0, maskBottom: 0, maskLeft: 0, maskFeather: 0.02, gain: 1, gamma: 1, flashGuard: true, surfaces: 2, test: false, identifying: false });
  const p = { cast: { screen: 'EPSON PJ', permission: 'granted', mode: 'ask', casting: false }, wall: fresh() };
  return {
    state: () => JSON.parse(JSON.stringify(p)),
    onMessage(m, answer, sendState) {
      if (m.do === 'cast') {
        if (m.on && blocked) { blocked = false; answer({ ok: false, reason: 'the show\'s window did not open (a browser blocks a window that no click opened)' }); return; }
        p.cast.casting = m.on;
      }
      if (m.do === 'mode') p.cast.mode = m.mode;
      if (m.do === 'test') p.wall.test = m.on;
      if (m.do === 'identify') p.wall.identifying = true;
      if (m.do === 'wall') Object.assign(p.wall, m.wall);
      if (m.do === 'wall-reset') p.wall = { ...fresh(), surfaces: p.wall.surfaces, test: p.wall.test };
      answer({ ok: true });
      sendState();
    },
  };
}

const projectorOf = (st) => { try { return JSON.parse(st.text.slice(st.text.indexOf('\n{') + 1)).projector ?? null; } catch { return null; } };

/** In Play: every call refused for want of Full, nothing at the display. */
export async function projectorPlayLines({ mcp, display, check }) {
  const t = Date.now();
  const r = [await mcp.call('projector', { command: 'cast', on: true }), await mcp.call('projector', { command: 'test', on: true }), await mcp.call('wall', { gain: 1.2 })];
  await sleep(150);
  check('projector-full', 'projector and wall are refused in Play, for want of Full, and nothing reaches the display',
    r.every((x) => !x.ok && /Full mode is needed/.test(x.text)) && display.since(t, 'assistant-projector').length === 0, r.map((x) => x.text).join(' | ').slice(0, 200));
}

/** In Full. */
export async function projectorFullLines({ mcp, display, check, phone }) {
  const got = (t) => display.since(t, 'assistant-projector');
  const state = async () => projectorOf(await mcp.call('show_state'));
  /** One call, and what reached the display after it. */
  const tryIt = async (tool, args) => { const t = Date.now(); const r = await mcp.call(tool, args); await sleep(200); return { r, sent: got(t) }; };

  const s0 = await state();
  check('-', 'show_state\'s projector carries the display\'s cast (the screen, the mode, shut) and wall (square, the flash guard on, two shapes, no test card)',
    s0?.cast?.screen === 'EPSON PJ' && s0.cast.mode === 'ask' && s0.cast.casting === false && s0.wall?.corners?.join() === SQUARE.join() && s0.wall.flashGuard === true && s0.wall.surfaces === 2 && s0.wall.test === false,
    JSON.stringify(s0).slice(0, 220));

  const blocked = await tryIt('projector', { command: 'cast', on: true });
  check('projector-answer', 'a cast the display could not open (the browser blocked its window) comes back refused with the display\'s words, not done',
    !blocked.r.ok && /did not open/.test(blocked.r.text) && blocked.sent.length === 1, blocked.r.text.slice(0, 160));

  const cast = await tryIt('projector', { command: 'cast', on: true });
  const s1 = await state();
  check('projector-cast', 'cast on reaches the display as cast on, and show_state reads the window open',
    cast.r.ok && cast.sent.some((m) => m.do === 'cast' && m.on === true) && s1?.cast?.casting === true, `${cast.r.text} | ${JSON.stringify(cast.sent)} | ${JSON.stringify(s1?.cast)}`.slice(0, 220));

  const auto = await tryIt('projector', { command: 'mode', mode: 'auto' });
  const always = await tryIt('projector', { command: 'mode', mode: 'always' });
  const s2 = await state();
  check('projector-mode', 'mode auto reaches the display and reads back; a mode that is not ask, auto or off is refused with nothing sent',
    auto.r.ok && auto.sent.some((m) => m.do === 'mode' && m.mode === 'auto') && s2?.cast?.mode === 'auto' && !always.r.ok && /ask, auto, off/.test(always.r.text) && always.sent.length === 0,
    `${auto.r.text} | ${always.r.text}`.slice(0, 200));

  const test = await tryIt('projector', { command: 'test', on: true });
  const ident = await tryIt('projector', { command: 'identify' });
  const s3 = await state();
  check('projector-test', 'test on and identify reach the display as themselves, and show_state reads the card up',
    test.r.ok && test.sent.some((m) => m.do === 'test' && m.on === true) && ident.r.ok && ident.sent.some((m) => m.do === 'identify') && s3?.wall?.test === true && s3.wall.identifying === true,
    `${JSON.stringify(test.sent)} | ${JSON.stringify(ident.sent)}`.slice(0, 200));

  const patch = await tryIt('wall', { flip_x: true, corners: KEYSTONE, mask_left: 0.1, gain: 1.3, gamma: 0.8 });
  const s4 = await state();
  const sentWall = patch.sent.find((m) => m.do === 'wall')?.wall;
  check('wall-patch', 'wall reaches the display with only the keys named, in the page\'s names (flipX, corners, maskLeft, gain, gamma), and show_state reads them back',
    patch.r.ok && JSON.stringify(Object.keys(sentWall ?? {}).sort()) === JSON.stringify(['corners', 'flipX', 'gain', 'gamma', 'maskLeft']) && sentWall.corners.join() === KEYSTONE.join()
      && s4?.wall?.flipX === true && s4.wall.corners.join() === KEYSTONE.join() && s4.wall.maskLeft === 0.1 && s4.wall.gain === 1.3 && s4.wall.flipY === false,
    `${patch.r.text} | ${JSON.stringify(patch.sent)}`.slice(0, 220));

  const off = await tryIt('wall', { corners: [1.5, 1.5, 2, 1.5, 2, 2, 1.5, 2] });
  const big = await tryIt('wall', { corners: [-1, -1, 2, -1, 2, 2, -1, 2] });
  check('wall-off-screen', 'corners that put the picture off the screen (all of it, or most of it past the edges) are refused, and nothing reaches the display',
    !off.r.ok && /off the screen \(0%/.test(off.r.text) && !big.r.ok && /off the screen \(11%/.test(big.r.text) && off.sent.length + big.sent.length === 0, `${off.r.text} | ${big.r.text}`.slice(0, 220));

  const fold = await tryIt('wall', { corners: [0, 0, 1, 1, 1, 0, 0, 1] });
  check('wall-fold', 'corners that cross and fold the picture over are refused as that, and nothing reaches the display',
    !fold.r.ok && /cross or fold/.test(fold.r.text) && fold.sent.length === 0, fold.r.text.slice(0, 160));

  const dot = await tryIt('wall', { corners: [0.5, 0.5, 0.55, 0.5, 0.55, 0.55, 0.5, 0.55] });
  check('wall-tiny', 'corners that shrink the picture to a dot are refused, and nothing reaches the display',
    !dot.r.ok && /shrinks the picture to 0\.3%/.test(dot.r.text) && dot.sent.length === 0, dot.r.text.slice(0, 160));

  const range = await tryIt('wall', { gain: 5 });
  const mask = await tryIt('wall', { mask_top: 0.6 });
  check('wall-range', 'a gain or a mask out of its range is refused with the range, and nothing reaches the display',
    !range.r.ok && /gain: from 0.2 to 3, not 5/.test(range.r.text) && !mask.r.ok && /maskTop: from 0 to 0.45/.test(mask.r.text) && range.sent.length + mask.sent.length === 0, `${range.r.text} | ${mask.r.text}`.slice(0, 200));

  const guardOff = await tryIt('wall', { flash_guard: false });
  const guardOn = await tryIt('wall', { flash_guard: true });
  check('wall-flash', 'the flash guard is never turned off from the assistant (nothing reaches the display), and can be turned on',
    !guardOff.r.ok && /safety/.test(guardOff.r.text) && guardOff.sent.length === 0 && guardOn.r.ok && guardOn.sent.some((m) => m.wall?.flashGuard === true), `${guardOff.r.text} | ${guardOn.r.text}`.slice(0, 200));

  const reset = await tryIt('wall', { reset: true });
  const s5 = await state();
  check('-', 'wall reset reaches the display as wall-reset: square again, the two shapes kept',
    reset.r.ok && reset.sent.some((m) => m.do === 'wall-reset') && s5?.wall?.corners?.join() === SQUARE.join() && s5.wall.flipX === false && s5.wall.surfaces === 2, reset.r.text.slice(0, 160));

  const t = Date.now();
  phone.ws.send(JSON.stringify({ type: 'assistant-projector', do: 'cast', on: false }));
  phone.ws.send(JSON.stringify({ type: 'assistant-projector', do: 'wall', wall: { corners: [1.5, 1.5, 2, 1.5, 2, 2, 1.5, 2] } }));
  await sleep(250);
  check('phone-projector', 'a phone\'s assistant-projector never reaches the display', got(t).length === 0);
}

/** The page's own half (app/projectorNow.ts), whoever sent the message. */
export async function projectorPageLines(page, say) {
  const shapes = [{ id: 'a' }, { id: 'b' }];
  let output = { flipX: false, flipY: false, corners: [...SQUARE], maskTop: 0, maskRight: 0, maskBottom: 0, maskLeft: 0, maskFeather: 0.02, gain: 1, gamma: 1, flashGuard: true, surfaces: shapes };
  let test = { pattern: false, identifyUntil: 0 };
  const cast = { screen: 'EPSON PJ', permission: 'granted', mode: 'ask', casting: false };
  const did = [];
  page.publishCast(cast);
  page.publishWall(output, test);
  const read = page.readProjector();
  page.publishWall(output, test);
  const same = page.readProjector() === read;
  // A door that opens: the cast says so a moment later, as the cast sender's state does.
  page.setCastDoor({ open: () => { did.push('open'); setTimeout(() => page.publishCast({ ...cast, casting: true }), 150); }, close: () => { did.push('close'); page.publishCast({ ...cast, casting: false }); }, setMode: (m) => did.push(`mode ${m}`) });
  page.setWallDoor({ patch: (fn) => { output = fn(output); did.push('patch'); }, reset: () => did.push('reset'), test: (fn) => { test = fn(test); did.push('test'); } });
  const opened = await page.askProjector({ do: 'cast', on: true });
  const again = await page.askProjector({ do: 'cast', on: true });
  const closed = await page.askProjector({ do: 'cast', on: false });
  // A door that never opens: a window the browser blocked.
  page.setCastDoor({ open: () => did.push('open blocked'), close: () => {}, setMode: () => {} });
  const stuck = await page.askProjector({ do: 'cast', on: true }, 300);
  const t0 = Date.now();
  const r = [
    await page.askProjector({ do: 'mode', mode: 'sometimes' }),
    await page.askProjector({ do: 'wall', wall: { gain: 9, corners: KEYSTONE, flashGuard: false, surfaces: [], test: { pattern: true, identifyUntil: 0 } } }),
    await page.askProjector({ do: 'test', on: true }), await page.askProjector({ do: 'identify' }), await page.askProjector({ do: 'wall-reset' }),
  ];
  page.publishWall(output, test);
  const shown = page.readProjector().wall;
  page.setCastDoor(null); page.setWallDoor(null);
  const none = await page.askProjector({ do: 'test', on: false });
  say(read.cast?.screen === 'EPSON PJ' && read.wall?.surfaces === 2 && same && opened === null && again === null && closed === null && /did not open/.test(stuck ?? '')
    && /mode: ask, auto or off/.test(r[0] ?? '') && r.slice(1).every((x) => x === null)
    && output.gain === 3 && output.corners.join() === KEYSTONE.join() && output.flashGuard === true && output.surfaces === shapes && test.pattern === true && test.identifyUntil >= t0 + 2900
    && shown.test === true && shown.identifying === true && shown.gain === 3 && /not running/.test(none ?? '')
    && JSON.stringify(did) === JSON.stringify(['open', 'close', 'open blocked', 'patch', 'test', 'test', 'reset']),
  `the page's askProjector opens the show's window and answers once it is open (and not again when it is), closes it, says so when a window never opened, refuses a mode not listed, lays a wall patch on through normalizeOutput (gain clamped to 3) and keeps the mapped shapes, the test card and a flash guard turned off out of it, puts the test card up and Identify for three seconds, and keeps one copy while nothing moved (${JSON.stringify(did)} ${JSON.stringify(r)} ${stuck})`.slice(0, 520));
}

/**
 * The page's wait for a window against the MCP server's wait for the page's
 * answer (mcp/chromaglass-mcp.js ANSWER_MS): a page that waits longer answers
 * a blocked window after the MCP server has given up and called it "allowed,
 * not confirmed", so the assistant never hears it was refused. The stand-in
 * display answers at once, so only this line holds the two apart.
 */
export function projectorWaitLine(page, say, root) {
  const answerMs = Number((/const ANSWER_MS = ([\d_]+);/.exec(readFileSync(`${root}/mcp/chromaglass-mcp.js`, 'utf8'))?.[1] ?? 'NaN').replace(/_/g, ''));
  say(page.CAST_WAIT_MS > 0 && page.CAST_WAIT_MS <= answerMs - 300,
    `the page's wait for the show's window (${page.CAST_WAIT_MS} ms) ends inside the MCP server's wait for its answer (${answerMs} ms), so a blocked window reaches the assistant as refused`);
}

export const PROJECTOR_MUTANTS = [
  { rule: 'projector-full', file: 'assistant.js', find: "if (type === 'assistant-projector') {\n        const why = needs(mode, 'full') ?? paced('patch', mode, t);", replace: "if (type === 'assistant-projector') {\n        const why = paced('patch', mode, t);" },
  { rule: 'projector-answer', file: 'assistant.js', find: "send({ type: 'assistant-projector', ...call.out, ...answerOf(message) });", replace: "send({ type: 'assistant-projector', ...call.out });" },
  { rule: 'projector-cast', file: 'assistantProjector.js', find: '{ out: { do: d, on: message.on } }', replace: '{ out: { do: d } }' },
  { rule: 'projector-mode', file: 'assistantProjector.js', find: 'PROJECTOR_MODES.includes(message.mode) ?', replace: 'true ?' },
  { rule: 'projector-test', file: 'assistantProjector.js', find: "if (d === 'identify' || d === 'wall-reset') return { out: { do: d } };", replace: "if (d === 'wall-reset') return { out: { do: d } };" },
  { rule: 'wall-patch', file: 'assistantProjector.js', find: "    wall[k] = w[k];\n  }\n  for (const [k, [lo, hi]]", replace: "  }\n  for (const [k, [lo, hi]]" },
  { rule: 'wall-off-screen', file: 'assistantProjector.js', find: 'if (seen < ON_SCREEN_MIN * whole) return', replace: 'if (false) return' },
  { rule: 'wall-fold', file: 'assistantProjector.js', find: 'if (!turns.every((z) => z > 1e-6)) return', replace: 'if (false) return' },
  { rule: 'wall-tiny', file: 'assistantProjector.js', find: 'if (seen < COVER_MIN) return', replace: 'if (false) return' },
  { rule: 'wall-range', file: 'assistantProjector.js', find: 'w[k] < lo || w[k] > hi)', replace: 'false)' },
  { rule: 'wall-flash', file: 'assistantProjector.js', find: 'if (w.flashGuard !== true) return', replace: 'if (false) return' },
  { rule: 'phone-projector', file: 'remote-server.js', find: ", 'assistant-projector']);", replace: ']);' },
];
