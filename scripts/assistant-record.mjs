/**
 * Recording's options and the Takes from the owner's assistant (PLAN 44k-11):
 * their lines in `npm run assistant`, kept beside `scripts/assistant.mjs`
 * because that file is close to the 100 KB `npm run sizes` stops a file
 * growing past.
 *
 * What it holds, read from what the stand-in display receives and from the
 * show's own answers, never from what the MCP server says it did:
 *  - record_options reaches the display as the Record panel's options (what
 *    Record makes, quality, fps, container, sound), and show_state's record
 *    reads every one of them back;
 *  - a container the display's encoder cannot write (the stand-in writes
 *    WebM only) is refused by the guard with the ones it can, and nothing
 *    reaches the display: the recorder itself would fall back to WebM
 *    without a word, and the assistant would tell the owner MP4;
 *  - values the panel does not offer (makes "audio", 24 fps, sound "yes") and
 *    an empty call are refused, and nothing reaches the display;
 *  - take replays, stops and deletes a Take by its number in show_state's
 *    list, and reaches the display carrying that Take's id, so the one
 *    deleted is the one read; a number past the list is refused with the
 *    count, and nothing reaches the display;
 *  - the display's own refusal (a stop with nothing replaying) comes back to
 *    the assistant as the reason;
 *  - all of it needs Full, and a phone's `assistant-record` never reaches
 *    the display.
 * Each rule has its mutant in RECORD_MUTANTS, run with assistant.mjs's own.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TAKES = [
  { id: 'perf-3', title: 'Wailana', artist: 'Hawaiian', seconds: 95, gestures: 410, clock: 'song', date: '2026-11-11T10:00:00Z' },
  { id: 'perf-2', title: null, artist: null, seconds: 40, gestures: 88, clock: 'wall', date: '2026-11-10T22:00:00Z' },
  { id: 'perf-1', title: 'Tiger Rag', artist: 'Original Dixieland Jass Band', seconds: 180, gestures: 930, clock: 'song', date: '2026-11-09T20:00:00Z' },
];

/**
 * The display's recording, as app/recordNow.ts reports it and askRecord
 * answers. Its encoder writes WebM only, so an MP4 has something to be
 * refused for. A Take is found by the id the guard resolved, never by the
 * number, so a guard that forgot the id is seen; a stop with nothing
 * replaying is refused, as the page's is.
 */
export function standInRecord() {
  const r = { makes: 'video', quality: 'standard', fps: 60, format: 'auto', sound: true, formats: ['webm'], videoSupported: true, lastVideo: null, replaying: null };
  let takes = TAKES.map((k) => ({ ...k }));
  return {
    state: () => ({ ...r, formats: [...r.formats], takes: takes.map((k, i) => ({ ...k, n: i + 1 })), takeCount: takes.length, replaying: r.replaying === null ? null : takes.findIndex((k) => k.id === r.replaying) + 1 || null }),
    onMessage(m, answer, sendState) {
      if (m.do === 'options') {
        for (const k of ['makes', 'quality', 'fps', 'format', 'sound']) if (m[k] !== undefined) r[k] = m[k];
      } else if (m.do === 'take-stop') {
        if (r.replaying === null) { answer({ ok: false, reason: 'the stand-in display replays no Take' }); return; }
        r.replaying = null;
      } else {
        const hit = takes.find((k) => k.id === m.id);
        if (!hit) { answer({ ok: false, reason: `the stand-in display has no Take by the id "${m.id}"` }); return; }
        if (m.do === 'take-replay') r.replaying = hit.id;
        if (m.do === 'take-delete') { takes = takes.filter((k) => k !== hit); if (r.replaying === hit.id) r.replaying = null; }
      }
      answer({ ok: true });
      sendState();
    },
  };
}

const recordOf = (st) => { try { return JSON.parse(st.text.slice(st.text.indexOf('\n{') + 1)).record ?? null; } catch { return null; } };

/** In Play: refused for want of Full. */
export async function recordPlayLines({ mcp, display, check }) {
  const t = Date.now();
  const r = [await mcp.call('record_options', { quality: 'master' }), await mcp.call('take', { command: 'delete' })];
  await sleep(150);
  check('record-full', 'record_options and take are refused in Play, for want of Full',
    r.every((x) => !x.ok && /Full mode is needed/.test(x.text)) && display.since(t, 'assistant-record').length === 0, r.map((x) => x.text).join(' | ').slice(0, 160));
}

/** In Full: the rest. */
export async function recordFullLines({ mcp, display, check, phone }) {
  const got = (t) => display.since(t, 'assistant-record');
  const state = async () => recordOf(await mcp.call('show_state'));

  // Every option, read back.
  const rec0 = await state();
  let t = Date.now();
  const set = await mcp.call('record_options', { makes: 'both', quality: 'master', fps: 30, format: 'webm', sound: false });
  await sleep(250);
  const rec1 = await state();
  check('-', 'record_options reaches the display as the Record panel\'s options, and show_state\'s record reads each back (makes, quality, fps, format, sound)',
    rec0?.makes === 'video' && set.ok && got(t).some((m) => m.do === 'options' && m.makes === 'both' && m.quality === 'master' && m.fps === 30 && m.format === 'webm' && m.sound === false)
    && rec1?.makes === 'both' && rec1.quality === 'master' && rec1.fps === 30 && rec1.format === 'webm' && rec1.sound === false,
    `${set.text} | ${JSON.stringify(rec1)}`.slice(0, 220));

  // A container the encoder cannot write.
  t = Date.now();
  const mp4 = await mcp.call('record_options', { format: 'mp4' });
  await sleep(150);
  check('record-format', 'a container the show\'s encoder cannot write (MP4, the stand-in writing WebM only) is refused with the ones it can, and nothing reaches the display',
    !mp4.ok && /cannot write mp4/.test(mp4.text) && /webm/.test(mp4.text) && got(t).length === 0, mp4.text.slice(0, 160));

  // What the panel does not offer.
  t = Date.now();
  const bad = [
    await mcp.call('record_options', { makes: 'audio' }), await mcp.call('record_options', { fps: 24 }),
    await mcp.call('record_options', { sound: 'yes' }), await mcp.call('record_options', {}),
  ];
  await sleep(150);
  check('record-values', 'makes "audio", 24 fps, sound "yes" and a call with nothing in it are refused, and nothing reaches the display',
    bad.every((x) => !x.ok) && /makes:/.test(bad[0].text) && /60 or 30/.test(bad[1].text) && /true or false/.test(bad[2].text) && /at least one/.test(bad[3].text) && got(t).length === 0,
    bad.map((x) => x.text).join(' | ').slice(0, 220));

  // A Take: replayed by number, reaching the display by its id.
  t = Date.now();
  const replay = await mcp.call('take', { command: 'replay', take: 3 });
  await sleep(250);
  const rec2 = await state();
  check('record-id', 'take replay 3 reaches the display carrying the third Take\'s id, and show_state\'s record.replaying reads 3',
    replay.ok && got(t).some((m) => m.do === 'take-replay' && m.id === 'perf-1') && rec2?.replaying === 3, `${replay.text} | ${JSON.stringify(got(t))} | ${rec2?.replaying}`.slice(0, 200));

  // Stop, and stop again: the display's refusal.
  t = Date.now();
  const stop = await mcp.call('take', { command: 'stop' });
  await sleep(150);
  const again = await mcp.call('take', { command: 'stop' });
  await sleep(150);
  check('record-answer', 'take stop reaches the display, and a second one, with nothing replaying, comes back refused with the display\'s reason',
    stop.ok && !again.ok && /replays no Take/.test(again.text) && got(t).filter((m) => m.do === 'take-stop').length === 2, `${stop.text} | ${again.text}`.slice(0, 160));

  // Past the list, and a delete.
  t = Date.now();
  const past = await mcp.call('take', { command: 'delete', take: 9 });
  await sleep(150);
  check('record-past', 'take delete 9, with three Takes listed, is refused with the count, and nothing reaches the display',
    !past.ok && /3 Takes/.test(past.text) && got(t).length === 0, past.text.slice(0, 140));
  t = Date.now();
  const del = await mcp.call('take', { command: 'delete', take: 2 });
  await sleep(250);
  const rec3 = await state();
  check('record-id', 'take delete 2 reaches the display carrying the second Take\'s id, and show_state\'s record lists the other two',
    del.ok && got(t).some((m) => m.do === 'take-delete' && m.id === 'perf-2') && rec3?.takeCount === 2 && rec3.takes.map((k) => k.id).join() === 'perf-3,perf-1',
    `${del.text} | ${JSON.stringify(rec3?.takes?.map((k) => k.id))}`.slice(0, 200));

  // A phone cannot.
  t = Date.now();
  phone.ws.send(JSON.stringify({ type: 'assistant-record', do: 'options', quality: 'compact' }));
  phone.ws.send(JSON.stringify({ type: 'assistant-record', do: 'take-delete', id: 'perf-3' }));
  await sleep(300);
  check('phone-record', 'a phone\'s assistant-record never reaches the display', got(t).length === 0, got(t).map((x) => x.do).join(','));
}

/** The page's own half (app/recordNow.ts `askRecord`), whoever sent the message. */
export function recordPageLines(page, say) {
  page.setRecordDoor(null);
  const base = { makes: 'video', quality: 'standard', fps: 60, format: 'auto', sound: true, formats: ['webm', 'mp4'], videoSupported: true, lastVideo: null, takeCount: 2, replaying: null,
    takes: [{ n: 1, id: 'a', title: null, artist: null, seconds: 3, gestures: 4, clock: 'wall', date: '' }, { n: 2, id: 'b', title: null, artist: null, seconds: 3, gestures: 4, clock: 'wall', date: '' }] };
  page.publishRecord({ ...base, formats: ['webm'] });
  const none = page.askRecord({ do: 'take-stop' });
  const did = [];
  const kept = new Set(['a', 'b']);
  page.setRecordDoor({
    choose: (c) => did.push(['choose', c.video, c.take]), options: (o) => did.push(['options', JSON.stringify(o)]),
    replay: (id) => { did.push(['replay', id]); return kept.has(id); }, stopReplay: () => did.push(['stop']),
    remove: (id) => { did.push(['remove', id]); return kept.has(id); },
  });
  const r = [
    page.askRecord({ do: 'options', makes: 'take', quality: 'compact', fps: 30, sound: false }),
    page.askRecord({ do: 'options', format: 'mp4' }), page.askRecord({ do: 'options', fps: 25 }), page.askRecord({ do: 'options' }),
    page.askRecord({ do: 'take-replay', take: 2 }), page.askRecord({ do: 'take-stop' }), page.askRecord({ do: 'take-delete', id: 'gone' }),
    page.askRecord({ do: 'wobble' }),
  ];
  // The same copy published again is the same copy (no state re-sent to every phone); a change is a new one.
  const c0 = page.readRecord();
  page.publishRecord({ ...base, formats: ['webm'] });
  const c1 = page.readRecord();
  page.publishRecord({ ...base, formats: ['webm'], replaying: 2 });
  const c2 = page.readRecord();
  const r2 = [page.askRecord({ do: 'take-stop' }), page.askRecord({ do: 'take-delete' })];
  page.setRecordDoor(null);
  const want = JSON.stringify([['choose', false, true], ['options', '{"quality":"compact","fps":30,"includeAudio":false}'], ['replay', 'b'], ['remove', 'gone'], ['stop'], ['remove', 'a']]);
  say(/not running/.test(none ?? '') && r[0] === null && /cannot write mp4/.test(r[1] ?? '') && /60 or 30/.test(r[2] ?? '') && /nothing to set/.test(r[3] ?? '') && r[4] === null
    && /no Take is replaying/.test(r[5] ?? '') && /is gone/.test(r[6] ?? '') && /not one of/.test(r[7] ?? '') && r2.every((x) => x === null)
    && c1 === c0 && c2 !== c1 && c2.replaying === 2 && JSON.stringify(did) === want,
  `the page's askRecord takes the panel's options (sound as includeAudio), refuses a container its encoder lacks, finds a Take by number in its copy, stops only a replay, says a Take deleted since is gone, and keeps one copy while nothing moved (${JSON.stringify(did)} ${JSON.stringify([none, ...r, ...r2])})`.slice(0, 420));
}

export const RECORD_MUTANTS = [
  { rule: 'record-full', file: 'assistant.js', find: "if (type === 'assistant-record') {\n        const why = needs(mode, 'full')", replace: "if (type === 'assistant-record') {\n        const why = needs(mode, 'play')" },
  { rule: 'record-format', file: 'assistantRecord.js', find: "if (message.format !== 'auto' && can && !can.includes(message.format)) {", replace: 'if (false) {' },
  { rule: 'record-values', file: 'assistantRecord.js', find: 'if (!RECORD_FPS.includes(message.fps)) return', replace: 'if (false) return' },
  { rule: 'record-values', file: 'assistantRecord.js', find: "if (Object.keys(out).length === 1) return", replace: 'if (false) return' },
  { rule: 'record-id', file: 'assistantRecord.js', find: 'return { out: { do: d, take: n, id: ids[n - 1] } };', replace: 'return { out: { do: d, take: n } };' },
  { rule: 'record-past', file: 'assistantRecord.js', find: 'if (n > ids.length) return', replace: 'if (false) return' },
  { rule: 'record-answer', file: 'assistant.js', find: "send({ type: 'assistant-record', ...call.out, ...answerOf(message) });", replace: "send({ type: 'assistant-record', ...call.out });" },
  { rule: 'phone-record', file: 'remote-server.js', find: "'assistant-undo', 'assistant-record', 'assistant-still',", replace: "'assistant-undo', 'assistant-still'," },
];
