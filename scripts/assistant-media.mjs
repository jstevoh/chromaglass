/**
 * Film, pours, the room camera and the mark from the owner's assistant (PLAN
 * 44k-13): their lines in `npm run assistant`, kept beside
 * `scripts/assistant.mjs` because that file is close to the 100 KB `npm run
 * sizes` stops a file growing past.
 *
 * What it holds, read from what the stand-in display receives, from the show
 * server's own addresses and from the show's answers, never from what the MCP
 * server says it did:
 *  - a film, a pour and a mark by their path reach the display as the show
 *    server's one-off address and the file's name, never the path, and the
 *    address serves the file's bytes, to the laptop alone;
 *  - each call takes its own kind: a picture is refused as the film, a film
 *    as the mark, an SVG and a text file everywhere, and a pour says which
 *    kind it is pouring; nothing refused reaches the display;
 *  - a film from the music folder (a folder that is not a media folder) is
 *    refused, as is a link out of the media folder;
 *  - a cartoon by its title in any case reaches the display by its shelf id;
 *    one not on the shelf is refused with the shelf;
 *  - a camera by its name in any case reaches the display by the name it
 *    lists, for the film and for the room camera; one not plugged in is
 *    refused with the cameras;
 *  - show_state's media reads each of them back;
 *  - the display's own refusal (a pour stopped with nothing pouring) comes
 *    back as the reason;
 *  - all of it needs Full, and a phone's `assistant-media` never reaches the
 *    display.
 * Each rule has its mutant in MEDIA_MUTANTS, run with assistant.mjs's own.
 */
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { musicDir } from './assistant-music.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEX = /^\/assistant-media\/[0-9a-f]{32}$/;
const BYTES = Buffer.from(Array.from({ length: 48 }, (_, i) => (i * 11 + 5) & 255));
const CAMERAS = ['FaceTime HD Camera', 'Elgato Cam Link 4K'];
const SHELF = [
  { id: 'skeleton-dance', title: 'The Skeleton Dance', seconds: 308 },
  { id: 'steamboat-willie', title: 'Steamboat Willie', seconds: 418 },
];

export const mediaDir = (dir) => join(dir, 'media');

/**
 * The display's film, pour, room camera and mark, as app/mediaNow.ts reports
 * them. A camera is taken only by the name it lists, and a cartoon only by
 * its shelf id, so a guard that passed the assistant's words on is seen; a
 * pour stopped with nothing pouring is refused, as the page's is.
 */
export function standInMedia() {
  const m = {
    film: { source: 'none', name: null, cartoon: null, camera: null, cameraLost: false },
    pour: { playing: false, name: null, cartoon: null },
    room: { on: false, camera: null, resume: false },
    mark: false,
  };
  const cam = (n) => (n === undefined ? CAMERAS[0] : CAMERAS.includes(n) ? n : null);
  const toon = (id) => SHELF.find((c) => c.id === id) ?? null;
  return {
    state: () => ({ film: { ...m.film }, pour: { ...m.pour }, room: { ...m.room }, mark: m.mark, cameras: [...CAMERAS], cartoons: SHELF.map((c) => ({ ...c })) }),
    onMessage(x, answer, sendState) {
      const no = (why) => answer({ ok: false, reason: `the stand-in display ${why}` });
      switch (x.do) {
        case 'film-file': m.film = { source: 'file', name: x.name, cartoon: null, camera: null, cameraLost: false }; break;
        case 'film-cartoon': { const c = toon(x.cartoon); if (!c) return no(`has no cartoon by the id "${x.cartoon}"`); m.film = { source: 'file', name: c.title, cartoon: c.id, camera: null, cameraLost: false }; break; }
        case 'film-camera': { const c = cam(x.camera); if (!c) return no(`has no camera named "${x.camera}"`); m.film = { source: 'camera', name: null, cartoon: null, camera: c, cameraLost: false }; break; }
        case 'film-window': m.film = { source: 'window', name: null, cartoon: null, camera: null, cameraLost: false }; break;
        case 'film-clear': m.film = { source: 'none', name: null, cartoon: null, camera: null, cameraLost: false }; break;
        case 'pour-file': if (x.kind === 'video') m.pour = { playing: true, name: x.name, cartoon: null }; break;
        case 'pour-cartoon': { const c = toon(x.cartoon); if (!c) return no(`has no cartoon by the id "${x.cartoon}"`); m.pour = { playing: true, name: c.title, cartoon: c.id }; break; }
        case 'pour-stop': if (!m.pour.playing) return no('pours nothing'); m.pour = { playing: false, name: null, cartoon: null }; break;
        case 'room': { const c = x.camera === undefined ? m.room.camera : cam(x.camera); if (c === null && x.camera !== undefined) return no(`has no camera named "${x.camera}"`); m.room = { on: x.on, camera: c, resume: false }; break; }
        case 'mark': m.mark = true; break;
        case 'mark-clear': m.mark = false; break;
        default: return no(`has no media call "${x.do}"`);
      }
      answer({ ok: true });
      sendState();
    },
  };
}

const mediaOf = (st) => { try { return JSON.parse(st.text.slice(st.text.indexOf('\n{') + 1)).media ?? null; } catch { return null; } };

/** In Play: refused for want of Full. */
export async function mediaPlayLines({ mcp, display, check }) {
  const t = Date.now();
  const r = [await mcp.call('film', { source: 'clear' }), await mcp.call('pour_file', { source: 'stop' }), await mcp.call('room_camera', { on: true }), await mcp.call('mark', { clear: true })];
  await sleep(150);
  check('media-full', 'film, pour_file, room_camera and mark are refused in Play, for want of Full',
    r.every((x) => !x.ok && /Full mode is needed/.test(x.text)) && display.since(t, 'assistant-media').length === 0, r.map((x) => x.text).join(' | ').slice(0, 160));
}

/** In Full: the rest. */
export async function mediaFullLines({ mcp, display, check, phone, port, dir }) {
  const media = mediaDir(realpathSync(dir));
  const music = musicDir(realpathSync(dir));
  mkdirSync(media, { recursive: true });
  mkdirSync(music, { recursive: true });
  for (const f of ['Oil Wheel.mp4', 'Logo.png', 'Drawing.svg', 'notes.txt']) writeFileSync(join(media, f), BYTES);
  writeFileSync(join(music, 'Concert.mp4'), BYTES);
  symlinkSync(join(music, 'Concert.mp4'), join(media, 'out.mp4'));
  const got = (t) => display.since(t, 'assistant-media');
  const state = async () => mediaOf(await mcp.call('show_state'));
  const get = async (path, headers = {}) => { try { return await fetch(`http://127.0.0.1:${port}${path}`, { headers }); } catch { return null; } };

  // A film by its path.
  let t = Date.now();
  const film = await mcp.call('film', { source: 'file', path: join(media, 'Oil Wheel.mp4') });
  await sleep(250);
  const sent = got(t).find((m) => m.do === 'film-file');
  const url = sent?.url ?? '';
  const whole = HEX.test(url) ? await get(url) : null;
  const wholeBytes = whole ? Buffer.from(await whole.arrayBuffer()) : null;
  const part = HEX.test(url) ? await get(url, { Range: 'bytes=4-9' }) : null;
  const away = HEX.test(url) ? await get(url, { 'X-Forwarded-For': '192.168.1.40' }) : null;
  const m1 = await state();
  check('media-path', 'a film by its path reaches the display as the show server\'s one-off address and its name, never the path; the address serves its bytes (by Range too, as video/mp4) to the laptop alone; show_state\'s media.film reads it back',
    film.ok && HEX.test(url) && sent.name === 'Oil Wheel' && !JSON.stringify(got(t)).includes(media) && whole?.status === 200 && wholeBytes?.equals(BYTES)
      && whole.headers.get('content-type') === 'video/mp4' && part?.status === 206 && away?.status === 403 && m1?.film?.source === 'file' && m1.film.name === 'Oil Wheel',
    `${film.text} | ${url} | ${whole?.status} ${whole?.headers.get('content-type')} ${part?.status} ${away?.status} | ${JSON.stringify(m1?.film)}`.slice(0, 240));

  // Each call its own kind.
  t = Date.now();
  const kinds = [
    await mcp.call('film', { source: 'file', path: join(media, 'Logo.png') }),
    await mcp.call('mark', { path: join(media, 'Oil Wheel.mp4') }),
    await mcp.call('mark', { path: join(media, 'Drawing.svg') }),
    await mcp.call('pour_file', { source: 'file', path: join(media, 'notes.txt') }),
  ];
  await sleep(150);
  check('media-kind', 'a picture as the film, a film as the mark, an SVG as the mark and a text file poured are each refused with the kinds it takes, and nothing reaches the display',
    kinds.every((x) => !x.ok) && /not a film/.test(kinds[0].text) && /not a picture for the mark/.test(kinds[1].text) && /not a picture for the mark/.test(kinds[2].text) && /not a picture or a film/.test(kinds[3].text) && got(t).length === 0,
    kinds.map((x) => x.text).join(' | ').slice(0, 260));

  // The media folder and no other.
  t = Date.now();
  const fromMusic = await mcp.call('film', { source: 'file', path: join(music, 'Concert.mp4') });
  const link = await mcp.call('film', { source: 'file', path: join(media, 'out.mp4') });
  await sleep(150);
  check('media-folder', 'a film in the music folder, and a link in the media folder pointing into it, are refused (media folders only), and nothing reaches the display',
    !fromMusic.ok && !link.ok && /media folders only/.test(fromMusic.text) && /media folders only/.test(link.text) && got(t).length === 0, `${fromMusic.text} | ${link.text}`.slice(0, 200));

  // Pours: a picture, a film, a stop, and a stop with nothing pouring.
  t = Date.now();
  const pic = await mcp.call('pour_file', { source: 'file', path: join(media, 'Logo.png') });
  const vid = await mcp.call('pour_file', { source: 'file', path: join(media, 'Oil Wheel.mp4') });
  await sleep(250);
  const m2 = await state();
  const stop = await mcp.call('pour_file', { source: 'stop' });
  await sleep(200);
  const again = await mcp.call('pour_file', { source: 'stop' });
  const pours = got(t).filter((m) => m.do === 'pour-file');
  check('media-answer', 'a picture pours as an image and a film as a video, show_state\'s media.pour reads the film pouring, and a second stop, with nothing pouring, comes back refused with the display\'s reason',
    pic.ok && vid.ok && pours.map((m) => m.kind).join() === 'image,video' && pours.every((m) => HEX.test(m.url)) && m2?.pour?.playing === true && m2.pour.name === 'Oil Wheel'
      && stop.ok && !again.ok && /pours nothing/.test(again.text) && got(t).filter((m) => m.do === 'pour-stop').length === 2,
    `${pours.map((m) => m.kind)} | ${JSON.stringify(m2?.pour)} | ${stop.text} | ${again.text}`.slice(0, 240));

  // A cartoon by its title.
  t = Date.now();
  const toon = await mcp.call('film', { source: 'cartoon', cartoon: 'steamboat WILLIE' });
  const nowhere = await mcp.call('pour_file', { source: 'cartoon', cartoon: 'Gertie the Dinosaur' });
  await sleep(250);
  const m3 = await state();
  check('media-cartoon', 'a cartoon by its title in any case reaches the display by its shelf id, show_state\'s media.film reads it back, and one not on the shelf is refused with the shelf',
    toon.ok && got(t).some((m) => m.do === 'film-cartoon' && m.cartoon === 'steamboat-willie') && m3?.film?.cartoon === 'steamboat-willie'
      && !nowhere.ok && /The Skeleton Dance; Steamboat Willie/.test(nowhere.text) && !got(t).some((m) => m.do === 'pour-cartoon'),
    `${toon.text} | ${nowhere.text} | ${JSON.stringify(m3?.film)}`.slice(0, 220));

  // Cameras by name, for the film and the room.
  t = Date.now();
  const filmCam = await mcp.call('film', { source: 'camera', camera: 'elgato cam link 4k' });
  const roomOn = await mcp.call('room_camera', { on: true, camera: 'facetime hd camera' });
  const gopro = await mcp.call('room_camera', { on: true, camera: 'GoPro' });
  await sleep(250);
  const m4 = await state();
  check('media-camera', 'a camera by its name in any case reaches the display by the name it lists, for the film and the room camera, and show_state\'s media reads both back; one not plugged in is refused with the cameras',
    filmCam.ok && roomOn.ok && got(t).some((m) => m.do === 'film-camera' && m.camera === 'Elgato Cam Link 4K') && got(t).some((m) => m.do === 'room' && m.on === true && m.camera === 'FaceTime HD Camera')
      && m4?.film?.camera === 'Elgato Cam Link 4K' && m4.room?.on === true && m4.room.camera === 'FaceTime HD Camera'
      && !gopro.ok && /FaceTime HD Camera, Elgato Cam Link 4K/.test(gopro.text) && got(t).filter((m) => m.do === 'room').length === 1,
    `${filmCam.text} | ${roomOn.text} | ${gopro.text} | ${JSON.stringify(m4?.room)}`.slice(0, 240));

  // The mark up and down, the room off, the film cleared.
  t = Date.now();
  const up = await mcp.call('mark', { path: join(media, 'Logo.png') });
  await sleep(250);
  const m5 = await state();
  const down = await mcp.call('mark', { clear: true });
  const off = await mcp.call('room_camera', { on: false });
  const clear = await mcp.call('film', { source: 'clear' });
  await sleep(250);
  const m6 = await state();
  const markUrl = got(t).find((m) => m.do === 'mark')?.url ?? '';
  const markGot = HEX.test(markUrl) ? await get(markUrl) : null;
  check('-', 'the mark goes up by its path (served as image/png) and comes down, the room camera goes off and the film clears, each read back in show_state\'s media',
    up.ok && down.ok && off.ok && clear.ok && m5?.mark === true && markGot?.status === 200 && markGot.headers.get('content-type') === 'image/png'
      && m6?.mark === false && m6.room?.on === false && m6.film?.source === 'none',
    `${up.text} | ${down.text} | ${off.text} | ${clear.text} | ${JSON.stringify(m6)}`.slice(0, 240));

  // A phone cannot.
  t = Date.now();
  phone.ws.send(JSON.stringify({ type: 'assistant-media', do: 'room', on: true }));
  phone.ws.send(JSON.stringify({ type: 'assistant-media', do: 'film-file', url: `/assistant-media/${'a'.repeat(32)}`, name: 'x' }));
  await sleep(300);
  check('phone-media', 'a phone\'s assistant-media never reaches the display', got(t).length === 0, got(t).map((x) => x.do).join(','));
}

/** The page's own half (app/mediaNow.ts `askMedia`), whoever sent the message. */
export async function mediaPageLines(page, say) {
  for (const k of ['film', 'pour', 'room', 'mark']) page.setMediaDoor(k, null);
  const none = await page.askMedia({ do: 'film-clear' });
  const did = [];
  page.setMediaDoor('film', { file: async (u, n) => { did.push(['film', u, n]); return null; }, cartoon: async (id) => { did.push(['toon', id]); return null; }, camera: async (id) => { did.push(['cam', id ?? '-']); return id === 'id-b' ? 'the camera would not open (NotReadableError)' : null; }, window: async () => null, clear: () => did.push(['clear']) });
  page.setMediaDoor('pour', { image: async (u) => { did.push(['image', u]); return null; }, video: (u, n) => did.push(['video', u, n]), cartoon: (id) => did.push(['pourtoon', id]), stop: () => did.push(['stop']) });
  page.setMediaDoor('room', { set: (on, id) => did.push(['room', on, id ?? '-']) });
  page.setMediaDoor('mark', { load: async (u) => { did.push(['mark', u]); return null; }, clear: () => did.push(['unmark']) });
  page.publishCameras([{ id: 'id-a', label: 'FaceTime HD Camera' }, { id: 'id-b', label: 'Cam Link' }]);
  const tok = `/assistant-media/${'c'.repeat(32)}`;
  const r = [
    await page.askMedia({ do: 'film-file', url: 'https://example.com/x.mp4', name: 'x' }), await page.askMedia({ do: 'mark', url: '/assistant-media/../x.png' }),
    await page.askMedia({ do: 'film-file', url: tok, name: ' Oil Wheel ' }), await page.askMedia({ do: 'film-cartoon', cartoon: 'nope' }),
    await page.askMedia({ do: 'film-camera', camera: 'facetime hd camera' }), await page.askMedia({ do: 'film-camera', camera: 'cam link' }),
    await page.askMedia({ do: 'room', on: true, camera: 'GoPro' }), await page.askMedia({ do: 'room', on: true }),
    await page.askMedia({ do: 'pour-file', url: tok, kind: 'image' }), await page.askMedia({ do: 'pour-stop' }),
    await page.askMedia({ do: 'film-clear' }), await page.askMedia({ do: 'mark-clear' }), await page.askMedia({ do: 'wobble' }),
  ];
  // What the hooks publish is what the checks above read: a film on, a mark up, and the same copy kept while nothing moved.
  page.publishMedia({ film: { source: 'file', name: 'Oil Wheel', cartoon: null, camera: null, cameraLost: false }, mark: true });
  const c0 = page.readMedia();
  page.publishMedia({ mark: true });
  const c1 = page.readMedia();
  const r2 = [await page.askMedia({ do: 'film-clear' }), await page.askMedia({ do: 'mark-clear' })];
  for (const k of ['film', 'pour', 'room', 'mark']) page.setMediaDoor(k, null);
  const want = JSON.stringify([['film', tok, 'Oil Wheel'], ['cam', 'id-a'], ['cam', 'id-b'], ['room', true, '-'], ['image', tok], ['clear'], ['unmark']]);
  say(/not running/.test(none ?? '') && /show server/.test(r[0] ?? '') && /show server/.test(r[1] ?? '') && r[2] === null && /The Skeleton Dance/.test(r[3] ?? '')
    && r[4] === null && /would not open/.test(r[5] ?? '') && /FaceTime HD Camera, Cam Link/.test(r[6] ?? '') && r[7] === null && r[8] === null
    && /nothing is pouring/.test(r[9] ?? '') && /no film/.test(r[10] ?? '') && /no mark/.test(r[11] ?? '') && /not one of/.test(r[12] ?? '')
    && r2.every((x) => x === null) && c1 === c0 && c0.cameras.join() === 'FaceTime HD Camera,Cam Link' && JSON.stringify(did) === want,
  `the page's askMedia takes a file only at the show server's address, a cartoon off the shelf, a camera by its name (and says why one would not open), refuses a stop or a clear with nothing on, and keeps one copy while nothing moved (${JSON.stringify(did)} ${JSON.stringify([none, ...r, ...r2])})`.slice(0, 460));
}

export const MEDIA_MUTANTS = [
  { rule: 'media-full', file: 'assistant.js', find: "if (type === 'assistant-media') {\n        const why = needs(mode, 'full')", replace: "if (type === 'assistant-media') {\n        const why = needs(mode, 'play')" },
  { rule: 'media-path', file: 'assistantMedia.js', find: '{ out: { do: d, url: f.url,', replace: '{ out: { do: d, path: message.path, url: f.url,' },
  { rule: 'media-kind', file: 'assistantMedia.js', find: "admit(message.path, VIDEO_TYPES, 'a film (a video file)')", replace: "admit(message.path, BOTH_TYPES, 'a film (a video file)')" },
  { rule: 'media-kind', file: 'assistantMedia.js', find: "admit(message.path, IMAGE_TYPES, 'a picture for the mark')", replace: "admit(message.path, BOTH_TYPES, 'a picture for the mark')" },
  { rule: 'media-kind', file: 'assistantMedia.js', find: "['.webp', 'image/webp']]);", replace: "['.webp', 'image/webp'], ['.svg', 'image/svg+xml'], ['.txt', 'text/plain']]);" },
  { rule: 'media-folder', file: 'assistantMedia.js', find: 'env.CHROMAGLASS_MEDIA_DIR.split(delimiter)', replace: '`${env.CHROMAGLASS_MEDIA_DIR}${delimiter}${env.CHROMAGLASS_MUSIC_DIR}`.split(delimiter)' },
  { rule: 'media-cartoon', file: 'assistantMedia.js', find: 'if (!hit) return { reason: `no cartoon', replace: 'if (!hit) return { cartoon: name.trim() }; if (false) return { reason: `no cartoon' },
  { rule: 'media-cartoon', file: 'assistantMedia.js', find: 'return { cartoon: hit.id };', replace: 'return { cartoon: name.trim() };' },
  { rule: 'media-camera', file: 'assistantMedia.js', find: 'if (hit === undefined) return { reason: `no camera', replace: 'if (false) return { reason: `no camera' },
  { rule: 'media-camera', file: 'assistantMedia.js', find: 'return { camera: hit };', replace: 'return { camera: name };' },
  { rule: 'media-answer', file: 'assistant.js', find: "send({ type: 'assistant-media', ...call.out, ...answerOf(message) });", replace: "send({ type: 'assistant-media', ...call.out });" },
  { rule: 'phone-media', file: 'remote-server.js', find: "'assistant-still', 'assistant-media', 'song-action',", replace: "'assistant-still', 'song-action'," },
];
