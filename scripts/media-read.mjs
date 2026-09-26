/**
 * Strict readers for the two containers a song render writes, for the checks.
 *
 *   import { readWebm, readMp4 } from './media-read.mjs';
 *
 * Written apart from the writers (src/lib/muxWebm.ts, src/lib/muxMp4.ts) and
 * from the specifications, not from the writers' code, so that a mistake in
 * a writer is not simply repeated here and agreed with. Strict where a
 * lenient player would carry on: every element or box has to end exactly
 * where its parent says, every size has to be known, every sample has to lie
 * inside the file, every chunk offset inside the mdat, and anything the
 * reader cannot account for is an error with the byte it happened at. A
 * browser's `<video>` is the other, independent judge (`npm run render-lab`).
 *
 * Both return the same shape: per track, each sample's presentation time in
 * microseconds (rounded to the container's own resolution; an MP4 track's
 * edit list honoured, so an audio encoder's priming comes out before zero),
 * its duration,
 * whether it is a keyframe, and its bytes, so a check can compare a file with
 * what was fed to the writer, sample for sample.
 */

class ReadError extends Error {}
const fail = (at, why) => { throw new ReadError(`${why} (at byte ${at})`); };

// ── WebM / Matroska ───────────────────────────────────────────────────────

const MASTER = new Set([
  0x1a45dfa3, // EBML
  0x18538067, // Segment
  0x114d9b74, 0x4dbb, // SeekHead, Seek
  0x1549a966, // Info
  0x1654ae6b, 0xae, 0xe0, 0xe1, // Tracks, TrackEntry, Video, Audio
  0x1f43b675, // Cluster
  0x1c53bb6b, 0xbb, 0xb7, // Cues, CuePoint, CueTrackPositions
]);

function readVint(b, at, keepMarker) {
  const first = b[at];
  if (first === undefined) fail(at, 'a size or ID runs past the end of the file');
  let w = 1;
  while (w <= 8 && !(first & (0x80 >> (w - 1)))) w++;
  if (w > 8) fail(at, 'a variable-length number with no length marker');
  let v = keepMarker ? first : first & (0xff >> w);
  let allOnes = (first & (0xff >> w)) === (0xff >> w);
  for (let i = 1; i < w; i++) {
    if (at + i >= b.length) fail(at, 'a size or ID runs past the end of the file');
    v = v * 256 + b[at + i];
    if (b[at + i] !== 0xff) allOnes = false;
  }
  return { value: v, width: w, unknown: !keepMarker && allOnes };
}

function readUint(b, at, n) { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[at + i]; return v; }

/** Every element from `start` to `end`, recursing into the masters; each must end exactly at its parent's end. */
function ebmlChildren(b, start, end) {
  const out = [];
  let at = start;
  while (at < end) {
    const id = readVint(b, at, true);
    const size = readVint(b, at + id.width, false);
    if (size.unknown) fail(at, `element 0x${id.value.toString(16)} has an unknown size: the writer did not patch it`);
    const body = at + id.width + size.width;
    const next = body + size.value;
    if (next > end) fail(at, `element 0x${id.value.toString(16)} runs ${next - end} bytes past its parent`);
    const e = { id: id.value, at, body, end: next };
    if (MASTER.has(id.value)) e.children = ebmlChildren(b, body, next);
    out.push(e);
    at = next;
  }
  if (at !== end) fail(at, 'elements do not end where their parent does');
  return out;
}

const one = (list, id, where) => {
  const found = list.filter((e) => e.id === id);
  if (found.length !== 1) fail(list[0]?.at ?? 0, `${where}: expected one 0x${id.toString(16)}, found ${found.length}`);
  return found[0];
};

export function readWebm(b) {
  const top = ebmlChildren(b, 0, b.length);
  if (top.length !== 2) fail(0, `a WebM file is an EBML header and one Segment, not ${top.length} elements`);
  const [ebml, segment] = top;
  if (ebml.id !== 0x1a45dfa3 || segment.id !== 0x18538067) fail(0, 'not EBML header then Segment');
  const docType = one(ebml.children, 0x4282, 'EBML header');
  const doc = String.fromCharCode(...b.subarray(docType.body, docType.end));
  if (doc !== 'webm') fail(docType.at, `DocType is ${doc}`);
  const seg = segment.children;
  const segData = segment.body;

  // The SeekHead has to point at the elements it names.
  const head = one(seg, 0x114d9b74, 'Segment');
  for (const seek of head.children) {
    const idEl = one(seek.children, 0x53ab, 'Seek');
    const posEl = one(seek.children, 0x53ac, 'Seek');
    const want = readUint(b, idEl.body, idEl.end - idEl.body);
    const pos = segData + readUint(b, posEl.body, posEl.end - posEl.body);
    const there = seg.find((e) => e.at === pos);
    if (!there || there.id !== want) fail(posEl.at, `SeekHead says 0x${want.toString(16)} is at ${pos}, and it is not`);
  }

  const info = one(seg, 0x1549a966, 'Segment');
  const scaleEl = one(info.children, 0x2ad7b1, 'Info');
  const scale = readUint(b, scaleEl.body, scaleEl.end - scaleEl.body);
  const durEl = one(info.children, 0x4489, 'Info');
  const dv = new DataView(b.buffer, b.byteOffset + durEl.body, durEl.end - durEl.body);
  const duration = durEl.end - durEl.body === 8 ? dv.getFloat64(0) : dv.getFloat32(0);

  const tracksEl = one(seg, 0x1654ae6b, 'Segment');
  const tracks = tracksEl.children.map((t) => {
    const num = one(t.children, 0xd7, 'TrackEntry');
    const codec = one(t.children, 0x86, 'TrackEntry');
    return { number: readUint(b, num.body, num.end - num.body), codec: String.fromCharCode(...b.subarray(codec.body, codec.end)), samples: [] };
  });

  const clusters = seg.filter((e) => e.id === 0x1f43b675);
  const clusterStarts = new Set();
  let lastMs = -Infinity;
  for (const c of clusters) {
    const tsEl = one(c.children, 0xe7, 'Cluster');
    const base = readUint(b, tsEl.body, tsEl.end - tsEl.body);
    clusterStarts.add(c.at - segData);
    for (const blk of c.children.filter((e) => e.id === 0xa3)) {
      const tn = readVint(b, blk.body, false);
      const rel = new DataView(b.buffer, b.byteOffset + blk.body + tn.width, 2).getInt16(0);
      const flags = b[blk.body + tn.width + 2];
      if (flags & 0x06) fail(blk.at, 'a laced SimpleBlock; the writer never laces');
      const track = tracks.find((t) => t.number === tn.value);
      if (!track) fail(blk.at, `a block for track ${tn.value}, which Tracks does not have`);
      const ms = base + rel;
      if (ms < lastMs) fail(blk.at, `blocks out of time order (${ms} ms after ${lastMs} ms)`);
      lastMs = ms;
      track.samples.push({ timeUs: (ms * scale) / 1000, key: !!(flags & 0x80), data: b.subarray(blk.body + tn.width + 3, blk.end) });
    }
    if (c.children.some((e) => e.id !== 0xe7 && e.id !== 0xa3)) fail(c.at, 'a cluster holds something other than a timestamp and blocks');
  }

  const cues = seg.find((e) => e.id === 0x1c53bb6b);
  let cuePoints = 0;
  if (cues) {
    for (const cp of cues.children) {
      const tp = one(cp.children, 0xb7, 'CuePoint');
      const pos = one(tp.children, 0xf1, 'CueTrackPositions');
      const p = readUint(b, pos.body, pos.end - pos.body);
      if (!clusterStarts.has(p)) fail(pos.at, `a cue points at ${p}, where no cluster starts`);
      cuePoints++;
    }
  }
  // Durations: to the next sample, and the last to the file's duration.
  for (const t of tracks) {
    t.samples.forEach((s, i) => {
      const next = t.samples[i + 1];
      s.durationUs = next ? next.timeUs - s.timeUs : duration * scale / 1000 - s.timeUs;
    });
  }
  return { kind: 'webm', durationMs: (duration * scale) / 1e6, tracks, clusters: clusters.length, cuePoints };
}

// ── MP4 ───────────────────────────────────────────────────────────────────

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts']);

function boxes(b, start, end) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = [];
  let at = start;
  while (at < end) {
    if (at + 8 > end) fail(at, 'a box header runs past its parent');
    let size = dv.getUint32(at);
    const type = String.fromCharCode(...b.subarray(at + 4, at + 8));
    let header = 8;
    if (size === 1) { size = dv.getUint32(at + 8) * 4294967296 + dv.getUint32(at + 12); header = 16; }
    else if (size === 0) fail(at, `box ${type} has size 0 (to end of file): the writer did not patch it`);
    if (size < header) fail(at, `box ${type} is smaller than its own header`);
    if (at + size > end) fail(at, `box ${type} runs ${at + size - end} bytes past its parent`);
    const box = { type, at, body: at + header, end: at + size };
    if (CONTAINERS.has(type)) box.children = boxes(b, box.body, box.end);
    if (type === 'stsd') box.children = boxes(b, box.body + 8, box.end);
    out.push(box);
    at += size;
  }
  if (at !== end) fail(at, 'boxes do not end where their parent does');
  return out;
}

const child = (parent, type) => {
  const found = (parent.children ?? []).filter((c) => c.type === type);
  if (found.length !== 1) fail(parent.at, `${parent.type} should hold one ${type}, holds ${found.length}`);
  return found[0];
};
const maybe = (parent, type) => (parent.children ?? []).find((c) => c.type === type) ?? null;

export function readMp4(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const top = boxes(b, 0, b.length);
  const types = top.map((x) => x.type).join(' ');
  if (top[0]?.type !== 'ftyp') fail(0, `the first box is ${top[0]?.type}, not ftyp`);
  const mdats = top.filter((x) => x.type === 'mdat');
  if (mdats.length !== 1) fail(0, `expected one mdat, found ${mdats.length} (${types})`);
  const mdat = mdats[0];
  const moov = top.find((x) => x.type === 'moov') ?? fail(0, `no moov (${types})`);
  const mvhd = child(moov, 'mvhd');
  if (b[mvhd.body] !== 0) fail(mvhd.at, 'mvhd version is not 0');
  const movieScale = dv.getUint32(mvhd.body + 12), movieDuration = dv.getUint32(mvhd.body + 16);
  const nextTrack = dv.getUint32(mvhd.end - 4);

  const tracks = moov.children.filter((x) => x.type === 'trak').map((trak) => {
    const tkhd = child(trak, 'tkhd');
    if (b[tkhd.body] !== 0) fail(tkhd.at, 'tkhd version is not 0');
    const id = dv.getUint32(tkhd.body + 12);
    const trackDuration = dv.getUint32(tkhd.body + 20);
    const mdia = child(trak, 'mdia');
    const mdhd = child(mdia, 'mdhd');
    const scale = dv.getUint32(mdhd.body + 12), mediaDuration = dv.getUint32(mdhd.body + 16);
    const handler = String.fromCharCode(...b.subarray(child(mdia, 'hdlr').body + 8, child(mdia, 'hdlr').body + 12));
    const stbl = child(child(mdia, 'minf'), 'stbl');
    const stsd = child(stbl, 'stsd');
    const entry = stsd.children[0];
    const u32s = (box, from) => { const n = dv.getUint32(box.body + from); return { n, at: box.body + from + 4 }; };

    const sizes = [];
    { const s = child(stbl, 'stsz'); const fixed = dv.getUint32(s.body + 4); const n = dv.getUint32(s.body + 8);
      for (let i = 0; i < n; i++) sizes.push(fixed || dv.getUint32(s.body + 12 + 4 * i));
      if (!fixed && s.body + 12 + 4 * n !== s.end) fail(s.at, 'stsz is not exactly its entries'); }
    const deltas = [];
    { const s = child(stbl, 'stts'); const { n, at } = u32s(s, 4);
      for (let i = 0; i < n; i++) for (let k = 0; k < dv.getUint32(at + 8 * i); k++) deltas.push(dv.getUint32(at + 8 * i + 4)); }
    if (deltas.length !== sizes.length) fail(stbl.at, `stts covers ${deltas.length} samples, stsz ${sizes.length}`);
    const offsets = [];
    { const ctts = maybe(stbl, 'ctts');
      if (ctts) { const v = b[ctts.body]; const { n, at } = u32s(ctts, 4);
        for (let i = 0; i < n; i++) for (let k = 0; k < dv.getUint32(at + 8 * i); k++) offsets.push(v === 1 ? dv.getInt32(at + 8 * i + 4) : dv.getUint32(at + 8 * i + 4));
        if (offsets.length !== sizes.length) fail(ctts.at, 'ctts does not cover every sample'); } }
    let keys = null;
    { const s = maybe(stbl, 'stss'); if (s) { const { n, at } = u32s(s, 4); keys = new Set(); for (let i = 0; i < n; i++) keys.add(dv.getUint32(at + 4 * i)); } }
    const chunkOffsets = [];
    { const s = maybe(stbl, 'stco') ?? child(stbl, 'co64'); const wide = s.type === 'co64'; const { n, at } = u32s(s, 4);
      for (let i = 0; i < n; i++) chunkOffsets.push(wide ? dv.getUint32(at + 8 * i) * 4294967296 + dv.getUint32(at + 8 * i + 4) : dv.getUint32(at + 4 * i)); }
    const stscRows = [];
    { const s = child(stbl, 'stsc'); const { n, at } = u32s(s, 4);
      for (let i = 0; i < n; i++) stscRows.push([dv.getUint32(at + 12 * i), dv.getUint32(at + 12 * i + 4)]); }

    /*
      The edit list, where there is one (14496-12, 8.6.6): which stretch of
      the media plays, and for how long. The writer puts one edit on an
      audio track, to skip the encoder's priming and end at the song's end
      (lib/muxShared.ts, `trimAudio`), and this reads exactly that shape and
      refuses the rest: one edit, at normal rate, starting inside the media
      and not running past it. Its media_time is where presentation time 0
      is, so the samples' times below are shifted by it: the priming's
      packets come out before zero, as a player sees them.
    */
    let edit = null;
    { const edts = maybe(trak, 'edts');
      if (edts) {
        const elst = child(edts, 'elst');
        const v = b[elst.body];
        if (v > 1) fail(elst.at, `elst version ${v}`);
        const n = dv.getUint32(elst.body + 4);
        if (n !== 1) fail(elst.at, `an edit list of ${n} edits; the writer makes one`);
        const at = elst.body + 8;
        const segment = v ? dv.getUint32(at) * 4294967296 + dv.getUint32(at + 4) : dv.getUint32(at);
        const mediaTime = v ? dv.getInt32(at + 8) * 4294967296 + dv.getUint32(at + 12) : dv.getInt32(at + 4);
        const rateAt = at + (v ? 16 : 8);
        if (dv.getInt16(rateAt) !== 1 || dv.getInt16(rateAt + 2) !== 0) fail(elst.at, 'an edit not at normal rate');
        if (elst.end !== rateAt + 4) fail(elst.at, 'elst is not exactly its one entry');
        if (mediaTime < 0) fail(elst.at, 'an empty edit (media_time -1): the writer makes none');
        if (mediaTime >= mediaDuration) fail(elst.at, `the edit starts at ${mediaTime}, past the media's ${mediaDuration} ticks`);
        // In the media's ticks, the edit may overshoot the media by less
        // than one of the movie's ticks: the movie's milliseconds are
        // coarser than the audio's samples, and the writer rounds.
        const segmentInMedia = (segment * scale) / movieScale;
        if (mediaTime + segmentInMedia > mediaDuration + scale / movieScale) fail(elst.at, `the edit runs ${(mediaTime + segmentInMedia - mediaDuration).toFixed(0)} ticks past the media`);
        edit = { mediaTime, segment, mediaTimeUs: (mediaTime * 1e6) / scale, segmentMs: (segment * 1000) / movieScale };
      }
    }
    const plays = edit ? edit.segment : Math.round((mediaDuration * movieScale) / scale);
    if (trackDuration !== plays) fail(tkhd.at, `tkhd says ${trackDuration} ticks, the track ${edit ? 'edit' : 'media'} plays ${plays}`);
    const shift = edit ? edit.mediaTime : 0;

    // Every sample's place in the file, from the chunk table.
    const samples = [];
    let s = 0, dts = 0;
    for (let c = 0; c < chunkOffsets.length; c++) {
      let row = stscRows[0];
      for (const r of stscRows) if (r[0] <= c + 1) row = r;
      let off = chunkOffsets[c];
      for (let k = 0; k < row[1]; k++, s++) {
        if (s >= sizes.length) fail(stbl.at, 'the chunk table holds more samples than stsz');
        if (off < mdat.body || off + sizes[s] > mdat.end) fail(off, `sample ${s} of track ${id} lies outside the mdat`);
        const pts = dts + (offsets[s] ?? 0) - shift;
        samples.push({ timeUs: (pts * 1e6) / scale, durationUs: (deltas[s] * 1e6) / scale, key: keys ? keys.has(s + 1) : true, data: b.subarray(off, off + sizes[s]) });
        off += sizes[s];
        dts += deltas[s];
      }
    }
    if (s !== sizes.length) fail(stbl.at, `the chunk table holds ${s} samples, stsz ${sizes.length}`);
    if (dts !== mediaDuration) fail(mdhd.at, `mdhd says ${mediaDuration} ticks, the samples add to ${dts}`);
    return { id, handler, codec: entry.type, scale, samples, mediaDurationMs: (mediaDuration * 1000) / scale, entry, edit, presentationMs: (trackDuration * 1000) / movieScale, trackDuration };
  });
  if (nextTrack !== tracks.length + 1) fail(mvhd.at, `next_track_ID ${nextTrack} with ${tracks.length} tracks`);
  // The movie lasts as long as its longest track plays (8.2.2).
  const longest = Math.max(0, ...tracks.map((t) => t.trackDuration));
  if (movieDuration !== longest) fail(mvhd.at, `mvhd says ${movieDuration} ticks, the longest track plays ${longest}`);
  return { kind: 'mp4', durationMs: (movieDuration * 1000) / movieScale, tracks, boxes: types };
}
