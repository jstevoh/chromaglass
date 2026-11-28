/**
 * How long a film is and which way up, read from the file itself (PLAN 44i-2c).
 *
 * Why. YouTube decides on its own that an upload is a Short: three minutes or
 * less, and square or taller than wide. Nothing in the API says "this is a
 * Short", and nothing in YouTube's answer says it became one, so the only way
 * to know before a film goes up is to measure the film. The server has no
 * packages and asks for no outside tools (a person installing it should not
 * also need ffmpeg), so the two kinds of file people actually upload are read
 * here by hand, and only as far as the few numbers needed:
 *
 *  - MP4, MOV and M4V are ISO base media files: a tree of boxes. The movie
 *    header (`moov/mvhd`) holds the length; each track's header
 *    (`trak/tkhd`) holds its picture size and the matrix it is shown through,
 *    and the track whose handler (`mdia/hdlr`) is `vide` is the picture. A
 *    phone films portrait as a landscape picture turned by that matrix, so the
 *    size is turned with it: a 1920x1080 track under a quarter turn is shown
 *    1080x1920, which is what YouTube judges. The `moov` box is often at the
 *    end of a long file (a camera writes it last), so the file is walked box
 *    by box from the start, reading eight or sixteen bytes a box, never the
 *    media itself.
 *  - WebM and MKV are EBML: the segment's `Info` holds the length (in units of
 *    its TimecodeScale), `Tracks` the video's pixel size (or its display size
 *    when that is given) and, from a projection, a roll. A browser's own
 *    recorder writes no length at all, so for that file the length is
 *    `null`, said so, and a Short is refused rather than guessed.
 *
 * A file of any other kind, or one this cannot read, answers `null`: not
 * known, never a guess. The mtime and size key a small memo, so a folder of
 * films is read once per call even though each file is judged twice (at the
 * call, then when its job is built).
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const MOOV_MAX = 64 * 1024 * 1024; // a moov past this is not a film people upload; refuse to read it whole
const EBML_HEAD = 4 * 1024 * 1024; // Info and Tracks come before the first Cluster, in the first few kB

function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  const n = readSync(fd, b, 0, len, pos);
  return n === len ? b : b.subarray(0, n);
}

/* ── ISO base media (MP4, MOV, M4V) ─────────────────────────────────── */

/** Each box in buf[from, to): { type, start (of its body), end }. */
function boxes(buf, from = 0, to = buf.length) {
  const out = [];
  let at = from;
  while (at + 8 <= to) {
    let size = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    let head = 8;
    if (size === 1) { if (at + 16 > to) break; size = Number(buf.readBigUInt64BE(at + 8)); head = 16; }
    else if (size === 0) size = to - at;
    if (size < head || at + size > to) break;
    out.push({ type, start: at + head, end: at + size });
    at += size;
  }
  return out;
}
const child = (buf, box, type) => boxes(buf, box.start, box.end).find((b) => b.type === type);
const fixed = (buf, at) => buf.readInt32BE(at) / 65536; // 16.16

/** The `moov` box of an ISO file, found by walking its top-level boxes header by header. */
function findMoov(fd, fileSize) {
  let at = 0;
  while (at + 8 <= fileSize) {
    const h = readAt(fd, at, 16);
    if (h.length < 8) return null;
    let size = h.readUInt32BE(0);
    const type = h.toString('latin1', 4, 8);
    let head = 8;
    if (size === 1) { if (h.length < 16) return null; size = Number(h.readBigUInt64BE(8)); head = 16; }
    else if (size === 0) size = fileSize - at;
    if (size < head) return null;
    if (type === 'moov') {
      if (size > MOOV_MAX) return null;
      const b = readAt(fd, at, size);
      return b.length === size ? b : null;
    }
    at += size;
  }
  return null;
}

/** The angle a track's matrix turns its picture by, in whole degrees (0, 90, 180, 270). */
function matrixTurn(buf, at) {
  const a = fixed(buf, at), b = fixed(buf, at + 4);
  const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

function readIso(fd, fileSize) {
  const moov = findMoov(fd, fileSize);
  if (!moov) return null;
  const top = { start: 8, end: moov.length };
  const mvhd = child(moov, top, 'mvhd');
  let durationSec = null;
  if (mvhd) {
    const v = moov[mvhd.start];
    const scale = v === 1 ? moov.readUInt32BE(mvhd.start + 20) : moov.readUInt32BE(mvhd.start + 12);
    const dur = v === 1 ? Number(moov.readBigUInt64BE(mvhd.start + 24)) : moov.readUInt32BE(mvhd.start + 16);
    // A fragmented file says 0 here and its whole length in mvex/mehd.
    let whole = dur;
    if (!whole) {
      const mvex = child(moov, top, 'mvex');
      const mehd = mvex && child(moov, mvex, 'mehd');
      if (mehd) whole = moov[mehd.start] === 1 ? Number(moov.readBigUInt64BE(mehd.start + 4)) : moov.readUInt32BE(mehd.start + 4);
    }
    if (scale > 0 && whole > 0 && whole !== 0xffffffff) durationSec = whole / scale;
  }
  for (const trak of boxes(moov, top.start, top.end).filter((b) => b.type === 'trak')) {
    const mdia = child(moov, trak, 'mdia');
    const hdlr = mdia && child(moov, mdia, 'hdlr');
    if (!hdlr || moov.toString('latin1', hdlr.start + 8, hdlr.start + 12) !== 'vide') continue;
    const tkhd = child(moov, trak, 'tkhd');
    if (!tkhd) continue;
    // After version+flags: v0 4+4+4+4+4, v1 8+8+4+4+8; then 8 reserved, 2+2+2+2, the 36-byte matrix, width, height.
    const matrixAt = tkhd.start + 4 + (moov[tkhd.start] === 1 ? 32 : 20) + 16;
    const rotation = matrixTurn(moov, matrixAt);
    let width = Math.round(fixed(moov, matrixAt + 36)), height = Math.round(fixed(moov, matrixAt + 40));
    if (!width || !height) {
      // No presentation size: the coded size from the first visual sample entry (minf/stbl/stsd).
      const minf = child(moov, mdia, 'minf'), stbl = minf && child(moov, minf, 'stbl'), stsd = stbl && child(moov, stbl, 'stsd');
      if (stsd && stsd.start + 8 + 36 <= stsd.end) { width = moov.readUInt16BE(stsd.start + 8 + 32); height = moov.readUInt16BE(stsd.start + 8 + 34); }
    }
    if (!width || !height) return { container: 'iso', durationSec, width: null, height: null, rotation };
    const turned = rotation === 90 || rotation === 270;
    return { container: 'iso', durationSec, width: turned ? height : width, height: turned ? width : height, rotation };
  }
  return { container: 'iso', durationSec, width: null, height: null, rotation: 0 };
}

/* ── EBML (WebM, MKV) ───────────────────────────────────────────────── */

const ID = { EBML: 0x1a45dfa3, SEGMENT: 0x18538067, INFO: 0x1549a966, SCALE: 0x2ad7b1, DURATION: 0x4489, TRACKS: 0x1654ae6b, ENTRY: 0xae, TYPE: 0x83, VIDEO: 0xe0, PW: 0xb0, PH: 0xba, DW: 0x54b0, DH: 0x54ba, PROJECTION: 0x7670, ROLL: 0x7675, CLUSTER: 0x1f43b675 };

/** A variable-length integer at buf[at]: { value, len }, value null for "unknown" (all ones). */
function vint(buf, at, keepMarker) {
  const first = buf[at];
  if (first === undefined || first === 0) return null;
  let len = 1;
  while (!(first & (0x80 >> (len - 1)))) len++;
  if (at + len > buf.length) return null;
  let value = keepMarker ? first : first & (0xff >> len);
  let ones = value === (0xff >> len);
  for (let i = 1; i < len; i++) { value = value * 256 + buf[at + i]; if (buf[at + i] !== 0xff) ones = false; }
  return { value: !keepMarker && ones ? null : value, len };
}
function elements(buf, from, to) {
  const out = [];
  let at = from;
  while (at < to) {
    const id = vint(buf, at, true);
    if (!id) break;
    const size = vint(buf, at + id.len, false);
    if (!size) break;
    const start = at + id.len + size.len;
    const end = size.value === null ? to : Math.min(start + size.value, to);
    out.push({ id: id.value, start, end, unknown: size.value === null });
    if (id.value === ID.CLUSTER) break;
    at = end;
  }
  return out;
}
const uint = (buf, e) => { let v = 0; for (let i = e.start; i < e.end; i++) v = v * 256 + buf[i]; return v; };
const float = (buf, e) => (e.end - e.start === 4 ? buf.readFloatBE(e.start) : e.end - e.start === 8 ? buf.readDoubleBE(e.start) : NaN);

function readEbml(fd, fileSize) {
  const buf = readAt(fd, 0, Math.min(EBML_HEAD, fileSize));
  const top = elements(buf, 0, buf.length);
  if (top[0]?.id !== ID.EBML) return null;
  const seg = top.find((e) => e.id === ID.SEGMENT);
  if (!seg) return null;
  let scale = 1_000_000, raw = null, width = null, height = null, rotation = 0;
  for (const e of elements(buf, seg.start, seg.end)) {
    if (e.id === ID.INFO) {
      for (const f of elements(buf, e.start, e.end)) {
        if (f.id === ID.SCALE) scale = uint(buf, f);
        else if (f.id === ID.DURATION) raw = float(buf, f);
      }
    } else if (e.id === ID.TRACKS && width === null) {
      for (const t of elements(buf, e.start, e.end).filter((x) => x.id === ID.ENTRY)) {
        const parts = elements(buf, t.start, t.end);
        const type = parts.find((x) => x.id === ID.TYPE);
        const video = parts.find((x) => x.id === ID.VIDEO);
        if (!video || (type && uint(buf, type) !== 1)) continue;
        const v = elements(buf, video.start, video.end);
        const get = (id) => { const x = v.find((y) => y.id === id); return x ? uint(buf, x) : null; };
        width = get(ID.DW) ?? get(ID.PW); height = get(ID.DH) ?? get(ID.PH);
        const proj = v.find((y) => y.id === ID.PROJECTION);
        const roll = proj && elements(buf, proj.start, proj.end).find((y) => y.id === ID.ROLL);
        if (roll) rotation = ((Math.round(float(buf, roll)) % 360) + 360) % 360;
        break;
      }
    }
  }
  const durationSec = Number.isFinite(raw) && raw > 0 ? (raw * scale) / 1e9 : null;
  if (width && height && (rotation === 90 || rotation === 270)) [width, height] = [height, width];
  return { container: 'ebml', durationSec, width: width || null, height: height || null, rotation };
}

/* ── The one export ─────────────────────────────────────────────────── */

const memo = new Map();
const READERS = { '.mp4': readIso, '.m4v': readIso, '.mov': readIso, '.webm': readEbml, '.mkv': readEbml };

/** { container, durationSec | null, width | null, height | null, rotation } as shown, or null if this kind of file is not read here. */
export function probeVideo(file) {
  const reader = READERS[extname(file).toLowerCase()];
  if (!reader) return null;
  let st;
  try { st = statSync(file); } catch { return null; }
  const key = `${file}\0${st.size}\0${st.mtimeMs}`;
  if (memo.has(key)) return memo.get(key);
  let out = null, fd;
  try { fd = openSync(file, 'r'); out = reader(fd, st.size); } catch { out = null; } finally { if (fd !== undefined) closeSync(fd); }
  if (memo.size > 256) memo.clear();
  memo.set(key, out);
  return out;
}

/** "2:05" for 125.4 s. */
export function clock(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
