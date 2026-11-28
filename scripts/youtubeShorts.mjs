/**
 * Shorts and folders, for `npm run youtube` (PLAN 44i-2c). A module of
 * scripts/youtube.mjs, which is past 40 KB, so this part lives beside it, as
 * scripts/youtubeText.mjs does for 44i-2b.
 *
 * The films here are real containers, made byte by byte below, not random
 * bytes: an MP4 with its movie header, a sound track ahead of the picture
 * track (so a reader that takes the first track reads no picture), a phone's
 * quarter turn, version-1 headers, its `moov` written last behind an 8 MB
 * `mdat` with a 64-bit size (as a camera writes a long film); a WebM with and
 * without a length (a browser's own recorder writes none), one in a
 * TimecodeScale that is not the default. So every line reads what the
 * server's own probe made of a file it has never seen, and each answer is
 * judged from what the stand-in Google received or what uploads.json holds,
 * never from what the server says it did.
 *
 * What it holds:
 *  - a Short is three minutes or less (3:00.04 refused, 3:00.00 taken) and
 *    square or tall as shown (landscape refused, a phone's turned landscape
 *    and a square taken), and a WebM is held the same; a film with no length
 *    is refused, not guessed.
 *  - `#Shorts` ends the description's own text once, and never when the
 *    title or description has it already.
 *  - a film not asked to be a Short that YouTube will make one says so; a
 *    Short over a minute names the Content ID rule.
 *  - an upload's chapters are held to the film's own length (44i-2b-2).
 *  - a card's `short` is read, and a `short` that is not true or false is
 *    refused.
 *  - a folder: one refused film queues nothing; a dry run queues nothing;
 *    films in name order with numbers as numbers, titled from the name when
 *    asked; each card wins over the folder's shared fields; only films
 *    directly in the folder (no hidden file, no subfolder, no folder named
 *    like a film, no text file); asking again queues only what is new;
 *    `skip_refused` queues the rest; a hidden folder and a folder of 101
 *    films are refused whole.
 */
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(50); } return false; };

// ── An MP4 (ISO base media), as much of one as a reader needs ─────────

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const fx = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(Math.round(v * 65536)); return b; };
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]); };
const full = (v) => Buffer.from([v, 0, 0, 0]);

function mvhd(v, scale, dur) {
  const times = v === 1 ? [u64(3_000_000_000), u64(3_000_000_001), u32(scale), u64(dur)] : [u32(3_000_000_000), u32(3_000_000_001), u32(scale), u32(dur)];
  return box('mvhd', full(v), ...times, Buffer.alloc(80));
}
function tkhd(v, turn, w, h) {
  const times = v === 1 ? [u64(1), u64(2), u32(1), u32(0), u64(1)] : [u32(1), u32(2), u32(1), u32(0), u32(1)];
  const [a, b, c, d] = turn === 90 ? [0, 1, -1, 0] : turn === 270 ? [0, -1, 1, 0] : turn === 180 ? [-1, 0, 0, -1] : [1, 0, 0, 1];
  const matrix = Buffer.concat([fx(a), fx(b), u32(0), fx(c), fx(d), u32(0), u32(0), u32(0), u32(0x40000000)]);
  return box('tkhd', full(v), ...times, Buffer.alloc(16), matrix, fx(w), fx(h));
}
const hdlr = (kind) => box('hdlr', full(0), u32(0), Buffer.from(kind, 'latin1'), Buffer.alloc(12), Buffer.from([0]));
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
/* A visual sample entry (avc1) with its coded size, for a track whose tkhd names none. */
const stsd = (w, h) => box('minf', box('stbl', box('stsd', full(0), u32(1), Buffer.concat([u32(86), Buffer.from('avc1', 'latin1'), Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(w), u16(h), Buffer.alloc(50)]))));
const trak = (v, kind, turn, w, h, coded) => box('trak', tkhd(v, turn, w, h), box('mdia', hdlr(kind), ...(coded ? [stsd(...coded)] : [])));

/**
 * An MP4's header boxes for `seconds`, `width`x`height` as presented, turned by `turn`; `v` its
 * header version; `coded` [w, h] in the sample entry (with width 0 x 0 in tkhd, as some muxers
 * write); `fragmented` writes mvhd's length 0 and the whole length in mvex/mehd, as a fragmented
 * recording does.
 */
function mp4Parts({ seconds, width, height, turn = 0, v = 0, coded, fragmented = false }) {
  const scale = 1000, dur = Math.round(seconds * scale);
  const ftyp = box('ftyp', Buffer.from('isom', 'latin1'), u32(0x200), Buffer.from('isommp41', 'latin1'));
  const mvex = fragmented ? [box('mvex', box('mehd', full(0), u32(dur)))] : [];
  const moov = box('moov', mvhd(v, scale, fragmented ? 0 : dur), ...mvex, trak(v, 'soun', 0, 0, 0), trak(v, 'vide', turn, coded ? 0 : width, coded ? 0 : height, coded));
  return { ftyp, moov };
}
export function mp4(o) {
  const { ftyp, moov } = mp4Parts(o);
  return Buffer.concat([ftyp, moov, box('mdat', Buffer.alloc(4096))]);
}
/**
 * As a camera writes a long film: the moov last, behind an mdat whose 64-bit size is past 4 GiB
 * (2^32 + 4096, so its high word is not zero and a reader of the low word alone misses the moov).
 * Written sparse, a few kB on disk, so a reader that loaded the media could not load it either.
 */
export function mp4Sparse(file, o) {
  const { ftyp, moov } = mp4Parts(o);
  const mdatSize = 2 ** 32 + 4096;
  const fd = openSync(file, 'w');
  try {
    writeSync(fd, ftyp, 0, ftyp.length, 0);
    const head = Buffer.concat([u32(1), Buffer.from('mdat', 'latin1'), u64(mdatSize)]);
    writeSync(fd, head, 0, head.length, ftyp.length);
    writeSync(fd, moov, 0, moov.length, ftyp.length + mdatSize);
  } finally { closeSync(fd); }
  return file;
}

// ── A WebM (EBML) ──────────────────────────────────────────────────────

const idBytes = (id) => { const b = []; for (let x = id; x > 0; x = Math.floor(x / 256)) b.unshift(x & 0xff); return Buffer.from(b); };
/* The shortest size vint, as muxers write small elements (one byte under 127, two under 16,383, ...). */
const vsize = (n) => {
  let len = 1;
  while (n >= 2 ** (7 * len) - 1) len++;
  const b = Buffer.alloc(len);
  let x = n;
  for (let i = len - 1; i >= 0; i--) { b[i] = x % 256; x = Math.floor(x / 256); }
  b[0] |= 0x80 >> (len - 1);
  return b;
};
const el = (id, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([idBytes(id), vsize(body.length), body]); };
const uintEl = (id, n) => { const b = []; for (let x = n; x > 0; x = Math.floor(x / 256)) b.unshift(x & 0xff); return el(id, Buffer.from(b.length ? b : [0])); };
const floatEl = (id, x) => { const b = Buffer.alloc(8); b.writeDoubleBE(x); return el(id, b); };

/**
 * A WebM `width`x`height` coded, `seconds` long (null: no Duration written, as a browser records),
 * its timecodes in `scale` ns; `display` [w, h] a DisplayWidth/Height of its own; `roll` a
 * projection's roll in degrees. A Void of 80 bytes sits ahead of Info, as muxers leave room after
 * the SeekHead, so a one-byte size of 64 or more is read on the way.
 */
export function webm({ seconds, width, height, scale = 1_000_000, display, roll }) {
  const head = el(0x1a45dfa3, el(0x4282, Buffer.from('webm')));
  const pad = el(0xec, Buffer.alloc(80));
  const info = el(0x1549a966, uintEl(0x2ad7b1, scale), ...(seconds === null ? [] : [floatEl(0x4489, (seconds * 1e9) / scale)]));
  const video = el(0xe0, uintEl(0xb0, width), uintEl(0xba, height), ...(display ? [uintEl(0x54b0, display[0]), uintEl(0x54ba, display[1])] : []), ...(roll !== undefined ? [el(0x7670, floatEl(0x7675, roll))] : []));
  const tracks = el(0x1654ae6b, el(0xae, uintEl(0xd7, 1), uintEl(0x83, 1), video));
  const cluster = el(0x1f43b675, Buffer.alloc(2048));
  // The segment of unknown size, as a recorder that cannot seek back writes it.
  const segment = Buffer.concat([idBytes(0x18538067), Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), pad, info, tracks, cluster]);
  return Buffer.concat([head, segment]);
}

// ── The scenario's lines ───────────────────────────────────────────────

export async function shortsScenario({ server, start, env, conf, dir, g, line, logs }) {
  const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; } };
  const sconf = join(dir, 'conf-shorts');
  mkdirSync(sconf, { recursive: true, mode: 0o700 });
  for (const f of ['client_secret.json', 'token.json']) writeFileSync(join(sconf, f), readFileSync(join(conf, f)));
  writeFileSync(join(sconf, 'settings.json'), JSON.stringify({ timeZone: 'America/Los_Angeles', categoryId: '10' }));
  const jobs = () => readJson(join(sconf, 'uploads.json')).jobs ?? [];
  const jobOf = (title) => jobs().find((j) => j.meta?.snippet?.title === title);
  const films = join(dir, 'films');
  mkdirSync(films, { recursive: true });
  const put = (name, bytes, where = films) => { const f = join(where, name); writeFileSync(f, bytes); return f; };
  const tall = (name, seconds, o = {}) => put(name, mp4({ seconds, width: 1080, height: 1920, ...o }));
  const wide = (name, seconds, o = {}) => put(name, mp4({ seconds, width: 1920, height: 1080, ...o }));
  const s = start(server, { ...env, CHROMAGLASS_YOUTUBE_DIR: sconf });
  logs.push(s.out);
  await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });
  const videoOf = (title) => [...g.videos.values()].find((v) => v.snippet.title === title);
  const said = (r) => `${r.error ? 'refused' : 'TAKEN'}: ${r.text.slice(0, 70)}`;

  // A Short, uploaded: the stand-in receives #Shorts at the end of the description's own text.
  const up = await s.tool('upload_video', { file: tall('tall42.mp4', 42), title: 'Tall One', description: 'A tall film.', short: true, chapters: ['0:00 a', '0:10 b', '0:20 c'], credits: 'Music: Test' });
  await until(() => videoOf('Tall One'), 8000);
  line('shortTag', 'a Short reaches YouTube with #Shorts on its own line after the description\'s text and before its chapters and credits, and its job says it is a Short (0:42, 1080x1920)',
    !up.error && videoOf('Tall One')?.snippet?.description === 'A tall film.\n\n#Shorts\n\n0:00 a\n0:10 b\n0:20 c\n\nMusic: Test' && /a Short \(0:42, 1080x1920/.test(up.v?.shorts ?? ''),
    `${said(up)}; got ${JSON.stringify(videoOf('Tall One')?.snippet?.description ?? null)}`);

  // Length: 3:00.04 is over, 3:00.00 is not; nothing is queued for a refusal.
  const n0 = jobs().length;
  const over = await s.tool('queue_upload', { file: tall('over.mp4', 180.04), title: 'Over', short: true });
  const n1 = jobs().length;
  const exact = await s.tool('queue_upload', { file: tall('exact.mp4', 180), title: 'Exact', short: true });
  line('shortLength', 'a Short of 3:00.04 is refused with its length and nothing queued; one of 3:00.00 is queued',
    over.error && /3:00 or less/.test(over.text) && /180\.04/.test(over.text) && n1 === n0 && !exact.error && jobOf('Exact'), `${said(over)} | ${said(exact)}`);

  // Shape as shown: landscape refused; a phone's landscape picture under a quarter turn, and a square, taken.
  const flat = await s.tool('queue_upload', { file: wide('flat.mp4', 30), title: 'Flat', short: true });
  const n2 = jobs().length;
  const phone = await s.tool('queue_upload', { file: wide('phone.mp4', 30, { turn: 90 }), title: 'Phone', short: true });
  const square = await s.tool('queue_upload', { file: put('square.mp4', mp4({ seconds: 30, width: 1080, height: 1080 })), title: 'Square', short: true });
  line('shortShape', 'a landscape Short is refused (wider than tall) with nothing queued; a phone\'s turned 1920x1080 is shown 1080x1920 and queued; a square is queued',
    flat.error && /wider than tall/.test(flat.text) && /9:16/.test(flat.text) && n2 === n1 + 1 && !phone.error && /1080x1920/.test(phone.v?.shorts ?? '') && !square.error && /1080x1080/.test(square.v?.shorts ?? ''),
    `${said(flat)} | ${said(phone)} | ${said(square)}`);

  // WebM: no length refused; with a length read; a length in a timecode scale that is not the default.
  const n3 = jobs().length;
  const rec = await s.tool('queue_upload', { file: put('browser.webm', webm({ seconds: null, width: 1080, height: 1920 })), title: 'Browser', short: true });
  line('shortUnknown', 'a WebM that writes no length (a browser\'s recording) is refused as a Short, not guessed, and nothing is queued',
    rec.error && /\(1080x1920\) does not say how long/.test(rec.text) && /out\.webm/.test(rec.text) && jobs().length === n3, said(rec));
  const wm = await s.tool('queue_upload', { file: put('tall.webm', webm({ seconds: 60, width: 1080, height: 1920 })), title: 'Tall WebM', short: true });
  const slow = await s.tool('queue_upload', { file: put('long.webm', webm({ seconds: 200, width: 720, height: 1280, scale: 2_000_000 })), title: 'Long WebM', short: true });
  line('webmLength', 'a WebM Short of 1:00 at 1080x1920 is queued; one of 3:20 written in 2 ms timecodes is refused',
    !wm.error && /1:00, 1080x1920/.test(wm.v?.shorts ?? '') && slow.error && /3:20/.test(slow.text), `${said(wm)} | ${said(slow)}`);

  // An MP4 as a camera writes a long one: moov last, behind an 8 MB mdat with a 64-bit size, version-1 headers, sound track first.
  const cam = await s.tool('queue_upload', { file: mp4Sparse(join(films, 'camera.mp4'), { seconds: 50, width: 720, height: 1280, v: 1 }), title: 'Camera', short: true });
  line('mp4Read', 'an MP4 with its moov last behind an mdat of 2^32 + 4096 bytes (a 64-bit size, written sparse), version-1 headers and a sound track first reads 0:50, 720x1280',
    !cam.error && /0:50, 720x1280/.test(cam.v?.shorts ?? ''), said(cam));

  // The other ways files say their shape and length: an MKV's display size, a WebM's roll, a
  // fragmented MP4's mehd, a MOV whose tkhd names no size (the sample entry does).
  const disp = await s.tool('queue_upload', { file: put('anamorphic.mkv', webm({ seconds: 30, width: 1920, height: 1080, display: [1080, 1920] })), title: 'Display', short: true });
  const rolled = await s.tool('queue_upload', { file: put('rolled.webm', webm({ seconds: 30, width: 1080, height: 1920, roll: 90 })), title: 'Rolled', short: true });
  const frag = await s.tool('queue_upload', { file: put('frag.mp4', mp4({ seconds: 70, width: 1080, height: 1920, fragmented: true })), title: 'Fragmented', short: true });
  const coded = await s.tool('queue_upload', { file: put('coded.mov', mp4({ seconds: 25, width: 1080, height: 1920, coded: [1080, 1920] })), title: 'Coded', short: true });
  line('probeKinds', 'an MKV coded 1920x1080 but displayed 1080x1920 is taken as 1080x1920; a tall WebM under a 90-degree roll is refused as wide; a fragmented MP4 reads 1:10 from mehd; a MOV with no size in tkhd reads 1080x1920 from its sample entry',
    !disp.error && /1080x1920/.test(disp.v?.shorts ?? '') && rolled.error && /1920x1080, wider than tall/.test(rolled.text)
    && !frag.error && /1:10, 1080x1920/.test(frag.v?.shorts ?? '') && !coded.error && /0:25, 1080x1920/.test(coded.v?.shorts ?? ''),
    [disp, rolled, frag, coded].map(said).join(' | '));

  // #Shorts once: not when the title or description already has it.
  const t1 = await s.tool('queue_upload', { file: tall('t1.mp4', 20), title: 'Tall #Shorts', description: 'Tall.', short: true });
  const t2 = await s.tool('queue_upload', { file: tall('t2.mp4', 20), title: 'Tall Two', description: 'Tall. #shorts', short: true });
  line('tagOnce', '#Shorts is not added when the title has it, nor when the description has #shorts already',
    !t1.error && !t2.error && jobOf('Tall #Shorts')?.meta?.snippet?.description === 'Tall.' && jobOf('Tall Two')?.meta?.snippet?.description === 'Tall. #shorts',
    JSON.stringify([jobOf('Tall #Shorts')?.meta?.snippet?.description, jobOf('Tall Two')?.meta?.snippet?.description]));

  // Not asked: a short tall film says YouTube will make it a Short, untagged; a long landscape one says nothing.
  const quiet = await s.tool('queue_upload', { file: tall('quiet.mp4', 30), title: 'Quiet', description: 'Q.' });
  const long = await s.tool('queue_upload', { file: tall('longtall.mp4', 240), title: 'Long Tall' });
  const flatShort = await s.tool('queue_upload', { file: wide('flatshort.mp4', 30), title: 'Flat Short' });
  const silent = (r) => !r.error && typeof r.v === 'object' && r.v !== null && r.v.job && r.v.shorts === undefined;
  line('shortsNote', 'a 0:30 tall film not asked to be a Short says YouTube will show it as one and is not tagged; a 4:00 tall film and a 0:30 landscape film say nothing; a 3:00 Short names the Content ID rule (over a minute), a 0:42 one and a 1:00 one do not',
    /YouTube will show this as a Short \(0:30, 1080x1920\)/.test(quiet.v?.shorts ?? '') && jobOf('Quiet')?.meta?.snippet?.description === 'Q.' && silent(long) && silent(flatShort)
    && /Content ID/.test(exact.v?.shorts ?? '') && !/Content ID/.test(up.v?.shorts ?? '') && /a Short/.test(wm.v?.shorts ?? '') && !/Content ID/.test(wm.v?.shorts ?? ''),
    JSON.stringify([quiet.v?.shorts, long.v?.shorts, flatShort.v?.shorts, exact.v?.shorts, wm.v?.shorts, up.v?.shorts]));

  // Chapters at upload held to the film's own length (44i-2b-2).
  const ch = ['0:00 a', '0:20 b', '0:55 c'];
  const near = await s.tool('queue_upload', { file: wide('ch60.mp4', 60), title: 'Ch60', chapters: ch });
  const roomy = await s.tool('queue_upload', { file: wide('ch120.mp4', 120), title: 'Ch120', chapters: ch });
  line('uploadChapters', 'at upload, a last chapter at 0:55 of a 1:00 film is refused (under ten seconds before the end); on a 2:00 film it is queued',
    near.error && /ten seconds before the video ends/.test(near.text) && !roomy.error, `${said(near)} | ${said(roomy)}`);

  // The card: short read from it, and a short that is not true or false refused.
  const cf = wide('cardwide.mp4', 30);
  writeFileSync(join(films, 'cardwide.youtube.json'), JSON.stringify({ title: 'Card Wide', short: true }));
  const cw = await s.tool('queue_upload', { file: cf });
  const cy = tall('cardyes.mp4', 30);
  writeFileSync(join(films, 'cardyes.youtube.json'), JSON.stringify({ title: 'Card Yes', short: 'yes' }));
  const cyr = await s.tool('queue_upload', { file: cy });
  line('cardShort', 'a card\'s "short": true holds a landscape film to the Short rule (refused); "short": "yes" is refused as not true or false',
    cw.error && /wider than tall/.test(cw.text) && cyr.error && /true or false/.test(cyr.text), `${said(cw)} | ${said(cyr)}`);

  // ── A folder ──
  const f1 = join(dir, 'release');
  mkdirSync(join(f1, 'sub'), { recursive: true });
  mkdirSync(join(f1, 'extra.mp4'));
  put('look-10.mp4', mp4({ seconds: 30, width: 1080, height: 1920 }), f1);
  writeFileSync(join(f1, 'look-10.youtube.json'), JSON.stringify({ title: 'Look ten', tags: ['card'] }));
  put('look-2.mp4', mp4({ seconds: 20, width: 1080, height: 1920 }), f1);
  put('notes.txt', 'not a film', f1);
  put('.hidden.mp4', mp4({ seconds: 20, width: 1080, height: 1920 }), f1);
  put('inner.mp4', mp4({ seconds: 20, width: 1080, height: 1920 }), join(f1, 'sub'));
  const shared = { folder: f1, short: true, tags: ['folder'] };
  const k0 = jobs().length;
  const whole = await s.tool('queue_folder', shared);
  const rows = (r) => (Array.isArray(r.v?.files) ? r.v.files : []);
  const st = (r, f) => rows(r).find((x) => x.file === f)?.state;
  line('folderWhole', 'a folder with one film refused (no title, no card) queues nothing, and says which and why',
    !whole.error && st(whole, 'look-2.mp4') === 'refused' && /no title/.test(rows(whole).find((x) => x.file === 'look-2.mp4')?.reason ?? '') && st(whole, 'look-10.mp4') === 'not queued' && jobs().length === k0 && /Nothing queued/.test(whole.v?.note ?? ''),
    whole.text.slice(0, 200));
  const dry = await s.tool('queue_folder', { ...shared, title_from_name: true, dry_run: true });
  line('folderDry', 'a dry run lists both films as would queue and queues nothing',
    !dry.error && st(dry, 'look-2.mp4') === 'would queue' && st(dry, 'look-10.mp4') === 'would queue' && jobs().length === k0, dry.text.slice(0, 200));
  const real = await s.tool('queue_folder', { ...shared, title_from_name: true });
  const names = rows(real).map((x) => x.file);
  line('folderFilms', 'only the two films directly in the folder are taken: not its .txt, its hidden film, its subfolder\'s film, or a folder named extra.mp4',
    !real.error && names.length === 2 && jobs().length === k0 + 2, `${names.join(', ')}; ${real.text.slice(0, 160)}`);
  const j2 = jobOf('Look 2'), j10 = jobOf('Look ten');
  line('folderOrder', 'films go in name order with numbers as numbers (look-2 before look-10), and a film with no card is titled from its name ("Look 2")',
    names[0] === 'look-2.mp4' && names[1] === 'look-10.mp4' && j2 && j10 && jobs().findIndex((j) => j.id === j2.id) < jobs().findIndex((j) => j.id === j10.id), `${names.join(', ')}; titles ${rows(real).map((x) => x.title).join(', ')}`);
  line('folderCard', 'each film\'s card wins over the folder\'s shared fields (tags card, not folder), the shared ones fill the rest (tags folder, #Shorts on both)',
    JSON.stringify(j10?.meta?.snippet?.tags) === '["card"]' && JSON.stringify(j2?.meta?.snippet?.tags) === '["folder"]' && /#Shorts$/.test(j10?.meta?.snippet?.description ?? '') && /#Shorts$/.test(j2?.meta?.snippet?.description ?? ''),
    JSON.stringify([j10?.meta?.snippet, j2?.meta?.snippet]));
  const again = await s.tool('queue_folder', { ...shared, title_from_name: true });
  const k1 = jobs().length;
  put('look-3.mp4', mp4({ seconds: 25, width: 1080, height: 1920 }), f1);
  const more = await s.tool('queue_folder', { ...shared, title_from_name: true });
  line('folderAgain', 'asking again queues nothing new (both already queued); after a third film is added, only it is queued',
    !again.error && st(again, 'look-2.mp4') === 'already queued' && st(again, 'look-10.mp4') === 'already queued' && k1 === k0 + 2
    && !more.error && st(more, 'look-3.mp4') === 'queued' && jobs().length === k1 + 1,
    `${again.text.slice(0, 120)} | ${more.text.slice(0, 120)}`);

  const f2 = join(dir, 'mixed');
  mkdirSync(f2, { recursive: true });
  put('a.mp4', mp4({ seconds: 30, width: 1920, height: 1080 }), f2);
  put('b.mp4', mp4({ seconds: 30, width: 1080, height: 1920 }), f2);
  const k2 = jobs().length;
  const strict = await s.tool('queue_folder', { folder: f2, short: true, title_from_name: true });
  const k3 = jobs().length;
  const skip = await s.tool('queue_folder', { folder: f2, short: true, title_from_name: true, skip_refused: true });
  line('folderSkip', 'a landscape film in a folder of Shorts queues nothing; with skip_refused the tall one is queued and the landscape one stays refused',
    !strict.error && st(strict, 'a.mp4') === 'refused' && k3 === k2 && !skip.error && st(skip, 'b.mp4') === 'queued' && st(skip, 'a.mp4') === 'refused' && jobs().length === k2 + 1,
    `${strict.text.slice(0, 120)} | ${skip.text.slice(0, 120)}`);

  // A film of a folder already up under its title is listed as up, with its link, and not queued again.
  const f3 = join(dir, 'upped');
  mkdirSync(f3, { recursive: true });
  const uf = put('c.mp4', mp4({ seconds: 20, width: 1080, height: 1920 }), f3);
  writeFileSync(join(f3, 'c.youtube.json'), JSON.stringify({ title: 'Upped' }));
  await s.tool('upload_video', { file: uf });
  await until(() => jobOf('Upped')?.state === 'done', 8000);
  const k5 = jobs().length;
  const ups = await s.tool('queue_folder', { folder: f3 });
  const upRow = rows(ups).find((x) => x.file === 'c.mp4');
  line('folderAgain', 'a folder\'s film already up under its title is listed as already up with its link, and nothing is queued',
    jobOf('Upped')?.state === 'done' && !ups.error && upRow?.state === 'already up' && /youtu\.be\//.test(upRow?.url ?? '') && jobs().length === k5, ups.text.slice(0, 160));

  const hid = join(dir, '.private');
  mkdirSync(hid, { recursive: true });
  put('x.mp4', mp4({ seconds: 20, width: 1080, height: 1920 }), hid);
  const hr = await s.tool('queue_folder', { folder: hid, title_from_name: true });
  line('folderHidden', 'a hidden folder is refused whole, as a hidden folder', hr.error && /hidden folder/.test(hr.text), said(hr));
  const big = join(dir, 'big');
  mkdirSync(big, { recursive: true });
  for (let i = 0; i < 101; i++) put(`f${i}.mp4`, Buffer.alloc(16), big);
  const k4 = jobs().length;
  const br = await s.tool('queue_folder', { folder: big, title_from_name: true });
  line('folderMax', 'a folder of 101 films is refused whole as likely the wrong folder, nothing queued', br.error && /101 films/.test(br.text) && jobs().length === k4, said(br));

  s.child.stdin.end();
  await Promise.race([s.exited, sleep(3000)]);
}
