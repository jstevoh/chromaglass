/**
 * The music player from the owner's assistant (PLAN 44k-2): its lines in
 * `npm run assistant`, kept beside `scripts/assistant.mjs` because that file
 * is close to the 100 KB `npm run sizes` stops a file growing past.
 *
 * What it holds, read from what the stand-in display receives and from the
 * show server's own answers, never from what the MCP server says it did:
 *  - a shelf track by part of its title reaches the display as the shelf's
 *    whole title, and one that is not on the shelf is refused with the list;
 *  - a file by its path reaches the display as the show server's one-off
 *    address and the file's name, never the path; the address serves the
 *    file's own bytes, by Range too (an audio element seeks that way), and
 *    to the laptop alone;
 *  - a path outside the music folder, a link inside it that points out, a
 *    `..` out of it, and a file that is not a sound file are refused, and
 *    nothing reaches the display;
 *  - a missing path outside the folder is refused as an existing one is (no
 *    probing which files exist), and a file swapped for a link out after it
 *    was admitted is not served;
 *  - play, pause, seek, loop and close reach it; a seek past the track's end
 *    is refused; show_state's player carries where it is forward while it
 *    plays;
 *  - the display's own refusal (nothing loaded any more, in a state that ran
 *    behind) comes back to the assistant as the reason;
 *  - all of it needs Full, and a phone's `assistant-music` never reaches the
 *    display.
 * Each rule has its mutant in MUSIC_MUTANTS, run with assistant.mjs's own.
 */
import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BYTES = Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 7 + 3) & 255));
const SHELF = [{ title: 'Live On Rainy Days', artist: 'Ananta', seconds: 1884 }, { title: 'Rain Garden', artist: 'X', seconds: 300 }, { title: 'Moonwalk', artist: 'Y', seconds: 200 }];

/** The music folder the show server is started with (CHROMAGLASS_MUSIC_DIR), under the scenario's own folder. */
export const musicDir = (dir) => join(dir, 'music');

/**
 * The display's player, as useSoundState and app/musicNow.ts report it: a
 * close reaches the state 600 ms late, as a throttled snapshot runs behind,
 * while the player itself (what it refuses) knows at once; a seek past the
 * end is answered done, since refusing it is the guard's rule, measured here.
 */
export function standInPlayer() {
  const p = { name: null, kind: null, artist: null, length: 0, at: 0, atTime: 0, playing: false, loop: true, library: SHELF };
  let reported = { ...p };
  let loaded = false;
  return {
    state: () => reported,
    onMessage(m, answer, sendState) {
      if (m.do === 'close') {
        loaded = false;
        answer({ ok: true });
        setTimeout(() => { Object.assign(p, { name: null, kind: null, playing: false, length: 0, at: 0 }); reported = { ...p }; sendState(); }, 600);
        return;
      }
      if (m.do === 'track' || m.do === 'file') {
        const t = SHELF.find((x) => x.title === m.track);
        Object.assign(p, { name: t ? t.title : m.name, kind: t ? 'track' : 'file', artist: t?.artist ?? null, length: t ? t.seconds : 180, at: 0, atTime: Date.now(), playing: true });
        loaded = true;
      } else if (!loaded && m.do !== 'loop') { answer({ ok: false, reason: 'the display\'s player has nothing loaded' }); return; }
      if (m.do === 'play' || m.do === 'pause') Object.assign(p, { playing: m.do === 'play', atTime: Date.now() });
      if (m.do === 'seek') Object.assign(p, { at: m.seconds, atTime: Date.now() });
      if (m.do === 'loop') p.loop = m.on;
      reported = { ...p };
      answer({ ok: true });
      sendState();
    },
  };
}

const HEX = /^\/assistant-music\/[0-9a-f]{32}$/;

/** In Play: refused for want of Full. */
export async function musicPlayLines({ mcp, display, check }) {
  const t = Date.now();
  const tr = await mcp.call('play_track', { track: 'Moonwalk' });
  const mu = await mcp.call('music', { command: 'pause' });
  await sleep(150);
  check('music-full', 'the music player is refused in Play, for want of Full', !tr.ok && !mu.ok && /Full mode is needed/.test(tr.text) && /Full mode is needed/.test(mu.text) && display.since(t, 'assistant-music').length === 0, `${tr.text} | ${mu.text}`.slice(0, 140));
}

/** In Full: the rest. */
export async function musicFullLines({ mcp, display, check, phone, port, dir }) {
  const music = musicDir(realpathSync(dir));
  const elsewhere = join(realpathSync(dir), 'elsewhere');
  mkdirSync(music, { recursive: true });
  mkdirSync(elsewhere, { recursive: true });
  writeFileSync(join(music, 'Tiger Rag.mp3'), BYTES);
  writeFileSync(join(music, 'notes.txt'), 'not music');
  writeFileSync(join(music, 'Swap.mp3'), BYTES);
  writeFileSync(join(elsewhere, 'secret.mp3'), BYTES);
  symlinkSync(join(elsewhere, 'secret.mp3'), join(music, 'out.mp3'));
  const got = (t) => display.since(t, 'assistant-music');
  const quiet = async (ms = 250) => { await sleep(ms); };

  // A shelf track.
  let t = Date.now();
  const rainy = await mcp.call('play_track', { track: 'rainy days' });
  await quiet(700);
  const st = await mcp.call('show_state');
  let shown = null;
  try { shown = JSON.parse(st.text.slice(st.text.indexOf('\n{') + 1)).player ?? null; } catch { /* no state */ }
  check('-', 'a shelf track by part of its title reaches the display by its whole title, and show_state\'s player carries where it is forward while it plays',
    rainy.ok && got(t).some((m) => m.do === 'track' && m.track === 'Live On Rainy Days') && shown?.name === 'Live On Rainy Days' && shown.at >= 0.3 && !('atTime' in shown),
    `${rainy.text} | ${JSON.stringify(shown)}`.slice(0, 200));
  t = Date.now();
  const nowhere = await mcp.call('play_track', { track: 'Nowhere Song' });
  const rain = await mcp.call('play_track', { track: 'rain' });
  await quiet();
  check('music-unknown', 'a track not on the shelf, or words more than one title holds, is refused with the shelf, and nothing reaches the display',
    !nowhere.ok && /Live On Rainy Days; Rain Garden; Moonwalk/.test(nowhere.text) && !rain.ok && got(t).length === 0, `${nowhere.text} | ${rain.text}`.slice(0, 160));

  // A file by its path.
  t = Date.now();
  const tiger = await mcp.call('play_track', { path: join(music, 'Tiger Rag.mp3') });
  await quiet();
  const sent = got(t).find((m) => m.do === 'file');
  const url = sent?.url ?? '';
  const base = `http://127.0.0.1:${port}`;
  // A mutant elsewhere can bring the show server down before here: a fetch that fails is a line that fails, not a crash.
  const get = async (path, headers = {}) => { try { return await fetch(base + path, { headers }); } catch { return null; } };
  const whole = HEX.test(url) ? await get(url) : null;
  const part = HEX.test(url) ? await get(url, { Range: 'bytes=10-19' }) : null;
  const tail = HEX.test(url) ? await get(url, { Range: 'bytes=-5' }) : null;
  const over = HEX.test(url) ? await get(url, { Range: `bytes=${BYTES.length}-` }) : null;
  const tailBytes = tail ? Buffer.from(await tail.arrayBuffer()) : null;
  const wholeBytes = whole ? Buffer.from(await whole.arrayBuffer()) : null;
  const partBytes = part ? Buffer.from(await part.arrayBuffer()) : null;
  check('-', 'a file by its path reaches the display as the show server\'s one-off address and its name, never the path, and the address serves its bytes, by Range too',
    tiger.ok && HEX.test(url) && sent.name === 'Tiger Rag' && !JSON.stringify(got(t)).includes(music) && whole?.status === 200 && wholeBytes?.equals(BYTES)
      && part?.status === 206 && partBytes?.equals(BYTES.subarray(10, 20)) && part.headers.get('content-range') === `bytes 10-19/${BYTES.length}`
      && tail?.status === 206 && tailBytes?.equals(BYTES.subarray(-5)) && over?.status === 416 && over.headers.get('content-range') === `bytes */${BYTES.length}`,
    `${tiger.text} | ${url} | ${whole?.status} ${part?.status} ${part?.headers.get('content-range')} ${tail?.status} ${over?.status}`.slice(0, 200));
  const away = HEX.test(url) ? await get(url, { 'X-Forwarded-For': '192.168.1.40' }) : null;
  const made = await get(`/assistant-music/${'0'.repeat(32)}`);
  check('music-laptop', 'the address serves the laptop alone: a forwarded request is refused, and an address the server never gave is not found', away?.status === 403 && made?.status === 404, `${away?.status} ${made?.status}`);

  t = Date.now();
  const out = await mcp.call('play_track', { path: join(elsewhere, 'secret.mp3') });
  check('music-folder', 'a file outside the music folder is refused, and nothing reaches the display', !out.ok && /music folder only/.test(out.text), out.text.slice(0, 140));
  const link = await mcp.call('play_track', { path: join(music, 'out.mp3') });
  const up = await mcp.call('play_track', { path: `${music}/../elsewhere/secret.mp3` });
  check('music-real', 'a link inside the music folder that points out of it, and a .. out of it, are refused', !link.ok && !up.ok && /music folder only/.test(link.text) && /music folder only/.test(up.text), `${link.text} | ${up.text}`.slice(0, 160));
  const txt = await mcp.call('play_track', { path: join(music, 'notes.txt') });
  await quiet();
  check('music-type', 'a file in the music folder that is not a sound file is refused', !txt.ok && /not a sound file/.test(txt.text), txt.text.slice(0, 140));
  const gone = await mcp.call('play_track', { path: join(elsewhere, 'nope.mp3') });
  const goneIn = await mcp.call('play_track', { path: join(music, 'nope.mp3') });
  check('music-probe', 'a missing file outside the folder is refused as an existing one is, so a refusal never says whether a file exists there; a missing one inside says so',
    !gone.ok && gone.text.replace(/nope|secret/g, '') === out.text.replace(/nope|secret/g, '') && !goneIn.ok && /no file at/.test(goneIn.text), `${gone.text} | ${goneIn.text}`.slice(0, 200));
  check('-', '…and none of those four reached the display', got(t).length === 0, got(t).map((m) => m.do).join(','));

  // A file swapped for a link out of the folder after it was admitted is not served.
  t = Date.now();
  const swap = await mcp.call('play_track', { path: join(music, 'Swap.mp3') });
  await quiet();
  const swapUrl = got(t).find((x) => x.do === 'file')?.url ?? '';
  const before = HEX.test(swapUrl) ? await get(swapUrl) : null;
  rmSync(join(music, 'Swap.mp3'));
  symlinkSync(join(elsewhere, 'secret.mp3'), join(music, 'Swap.mp3'));
  const after = HEX.test(swapUrl) ? await get(swapUrl) : null;
  check('music-swap', 'the address is judged again as it is served: a file swapped for a link out of the folder is not followed', swap.ok && before?.status === 200 && after?.status === 404, `${swap.text} | ${before?.status} ${after?.status}`.slice(0, 160));

  // The transport.
  t = Date.now();
  const calls = [['pause', {}], ['play', {}], ['seek', { seconds: 30 }], ['loop', { on: false }]];
  const said = [];
  for (const [command, extra] of calls) { said.push(await mcp.call('music', { command, ...extra })); await sleep(60); }
  await quiet();
  const m = got(t);
  check('-', 'play, pause, seek and loop reach the display as the player\'s own', said.every((r) => r.ok) && m.some((x) => x.do === 'pause') && m.some((x) => x.do === 'play') && m.some((x) => x.do === 'seek' && x.seconds === 30) && m.some((x) => x.do === 'loop' && x.on === false),
    said.map((r) => r.text).join(' | ').slice(0, 200));
  t = Date.now();
  const past = await mcp.call('music', { command: 'seek', seconds: 999 });
  await quiet();
  check('music-length', 'a seek past the track\'s end is refused with its length, and nothing reaches the display', !past.ok && /180 s long/.test(past.text) && got(t).length === 0, past.text.slice(0, 140));

  // Closed, and played again before the display's state says so.
  t = Date.now();
  const close = await mcp.call('music', { command: 'close' });
  const again = await mcp.call('music', { command: 'play' });
  check('music-answer', 'the display\'s own refusal (nothing loaded, in a state that ran behind) comes back to the assistant as its reason', close.ok && !again.ok && /display's player has nothing loaded/.test(again.text) && got(t).some((x) => x.do === 'close'), `${close.text} | ${again.text}`.slice(0, 160));
  await quiet(700);

  // A phone cannot.
  t = Date.now();
  phone.ws.send(JSON.stringify({ type: 'assistant-music', do: 'file', url: `/assistant-music/${'a'.repeat(32)}`, name: 'x' }));
  phone.ws.send(JSON.stringify({ type: 'assistant-music', do: 'close' }));
  await quiet(300);
  check('phone-music', 'a phone\'s assistant-music never reaches the display', got(t).length === 0, got(t).map((x) => x.do).join(','));
}

/** The page's own half (app/musicNow.ts `askMusic`), whoever sent the message. */
export function musicPageLines(page, say) {
  page.setMusicDoor(null);
  say(/not running/.test(page.askMusic({ do: 'play' }) ?? ''), 'with no player mounted, the page\'s askMusic says so');
  const did = [];
  page.setMusicDoor({ track: (x) => did.push(['track', x.title]), file: (u, n) => did.push(['file', u, n]), play: () => did.push(['play']), pause: () => did.push(['pause']), seek: (s) => did.push(['seek', s]), close: () => did.push(['close']) });
  page.setLoopDoor((on) => did.push(['loop', on]));
  page.publishPlayer({ name: null, kind: null, artist: null, length: 0, at: 0, atTime: 0, playing: false, loop: true, library: [] });
  const tok = `/assistant-music/${'b'.repeat(32)}`;
  const r = [
    page.askMusic({ do: 'track', track: 'rainy days' }), page.askMusic({ do: 'track', track: 'no such song' }),
    page.askMusic({ do: 'file', url: 'https://example.com/x.mp3', name: 'x' }), page.askMusic({ do: 'file', url: '/assistant-music/../music/x.mp3' }), page.askMusic({ do: 'file', url: tok, name: ' Tiger Rag ' }),
    page.askMusic({ do: 'play' }),
  ];
  page.publishPlayer({ name: 'Tiger Rag', kind: 'file', artist: null, length: 100, at: 0, atTime: Date.now(), playing: true, loop: true, library: [] });
  const r2 = [page.askMusic({ do: 'seek', seconds: 150 }), page.askMusic({ do: 'seek', seconds: 30 }), page.askMusic({ do: 'loop', on: false }), page.askMusic({ do: 'close' })];
  page.setMusicDoor(null);
  page.setLoopDoor(null);
  const want = JSON.stringify([['track', 'Live On Rainy Days'], ['file', tok, 'Tiger Rag'], ['seek', 30], ['loop', false], ['close']]);
  say(r[0] === null && /no track/.test(r[1] ?? '') && /show server/.test(r[2] ?? '') && /show server/.test(r[3] ?? '') && r[4] === null && /nothing is loaded/.test(r[5] ?? '')
    && /100 s long/.test(r2[0] ?? '') && r2.slice(1).every((x) => x === null) && JSON.stringify(did) === want,
  `the page's askMusic opens a shelf track by its title, takes a file only at the show server's own address, refuses a transport with nothing loaded and a seek past the end (${JSON.stringify(did)} ${JSON.stringify([...r, ...r2])})`.slice(0, 400));
}

export const MUSIC_MUTANTS = [
  { rule: 'music-full', file: 'assistant.js', find: "if (type === 'assistant-music') {\n        const why = needs(mode, 'full')", replace: "if (type === 'assistant-music') {\n        const why = needs(mode, 'play')" },
  { rule: 'music-unknown', file: 'assistantMusic.js', find: 'if (!hit) return { reason: `no track', replace: 'if (false) return { reason: `no track' },
  { rule: 'music-laptop', file: 'remote-server.js', find: 'serveMusicFile(req, res, url, isLaptop(req))', replace: 'serveMusicFile(req, res, url, true)' },
  { rule: 'music-folder', file: 'assistantMusic.js', find: 'if (!inside(found, roots)) return outside;', replace: '' },
  { rule: 'music-real', file: 'assistantMusic.js', find: 'const found = real(asked);', replace: 'const found = real(asked) && asked;' },
  { rule: 'music-probe', file: 'assistantMusic.js', find: "? { reason: `no file at ${raw}` } : outside;", replace: "? { reason: `no file at ${raw}` } : { reason: `no file at ${raw}` };" },
  { rule: 'music-swap', file: 'assistantMusic.js', find: 'if (now && inside(now, f.folders.map(real).filter(Boolean)))', replace: 'if (now)' },
  { rule: 'music-type', file: 'assistantMusic.js', find: 'if (!type) return { reason: `not ${what}', replace: 'if (false) return { reason: `not ${what}' },
  { rule: 'music-length', file: 'assistantMusic.js', find: 'if (player?.length > 0 && s > player.length)', replace: 'if (false)' },
  { rule: 'music-answer', file: 'assistant.js', find: "send({ type: 'assistant-music', ...call.out, ...answerOf(message) });", replace: "send({ type: 'assistant-music', ...call.out });" },
  { rule: 'phone-music', file: 'remote-server.js', find: "'assistant-songs', 'assistant-music',", replace: "'assistant-songs'," },
];
