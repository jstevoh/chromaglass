/**
 * The channel manifest (PLAN 44i-6), moved out of youtube-mcp.js unchanged (44i-2c-2).
 *
 * Why it moved. The server had grown to about 96 KB of the repository's 100 KB
 * ceiling for one file, and 44i-2d's analytics could not land in it. The manifest
 * is the server's own record of the channel (one entry per video, the owner's
 * notes on each, what replaced what), read and written by the uploads, the
 * release plan and the `manifest` command, and it is the piece with the fewest
 * ties back into the server: a file, the clock, and three calls to Google. So it
 * is the piece that came out, word for word.
 *
 * Why the server hands it those ties with `bindManifest` rather than each call
 * taking them. A pure move keeps every line as it was, so a reader comparing the
 * two files (and the check's mutants, which cut these lines by their text) sees
 * the same code; threading a context argument through eight functions would have
 * changed most of them. The server binds once at start, before any tool can run,
 * and nothing else in the folder imports this file.
 */
import { existsSync, readFileSync } from 'node:fs';

let MANIFEST_FILE, writePrivate, nowMs, channel, api, videos;
/** The server's file, its private writer, its clock and its Google calls; set once at start. */
export function bindManifest(deps) {
  ({ MANIFEST_FILE, writePrivate, nowMs, channel, api, videos } = deps);
}

export const MANIFEST_STATUS = ['ok', 'rerecord', 'queued', 'replaced', 'removed'];
export function readManifestStrict() {
  if (!existsSync(MANIFEST_FILE)) return { syncedAt: null, videos: [] };
  const d = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));
  if (Array.isArray(d)) return { syncedAt: null, videos: d };
  if (!d || typeof d !== 'object' || !Array.isArray(d.videos)) throw new Error(`${MANIFEST_FILE} is unreadable.`);
  return { syncedAt: d.syncedAt ?? null, videos: d.videos };
}
export function readManifest() { try { return readManifestStrict(); } catch { return { syncedAt: null, videos: [] }; } }
export function writeManifest(m) {
  writePrivate(MANIFEST_FILE, JSON.stringify({ syncedAt: m.syncedAt ?? null, videos: m.videos }, null, 2));
}

export function recordPlaylistInManifest(videoId, pl) {
  const m = readManifest();
  const idx = m.videos.findIndex((e) => e.videoId === videoId);
  if (idx < 0 || !Array.isArray(m.videos[idx].playlists)) return;
  const list = m.videos[idx].playlists.filter((p) => p.id !== pl.id);
  list.push(pl);
  m.videos[idx] = { ...m.videos[idx], playlists: list, updatedAt: new Date(nowMs()).toISOString() };
  writeManifest(m);
}

export const jobPlaylists = (job) => (Array.isArray(job.playlists) && job.playlists.length ? job.playlists : job.playlist_id ? [{ id: job.playlist_id }] : []);

export function recordUploadedManifest(job, video, finishedAt) {
  if (!job.key && !job.replaces) return;
  const m = readManifest();
  const videos = m.videos.slice();
  const idx = videos.findIndex((e) => e.videoId === video.id);
  const prev = idx >= 0 ? videos[idx] : {};
  const pls = jobPlaylists(job);
  const entry = {
    ...prev,
    videoId: video.id,
    title: video.snippet?.title ?? job.meta.snippet.title,
    privacy: video.status?.privacyStatus ?? job.meta.status.privacyStatus,
    publishedAt: video.snippet?.publishedAt ?? finishedAt,
    ...(job.meta.status.publishAt ? { publishAt: job.meta.status.publishAt } : {}),
    ...(pls.length ? { playlists: pls } : {}),
    ...(job.key ? { key: job.key } : {}),
    source: job.file,
    status: 'ok',
    ...(job.replaces ? { replaces: job.replaces } : {}),
    updatedAt: finishedAt,
  };
  if (idx >= 0) videos[idx] = entry; else videos.unshift(entry);
  if (job.replaces) {
    const rIdx = videos.findIndex((e) => e.videoId === job.replaces);
    if (rIdx >= 0) {
      videos[rIdx] = { ...videos[rIdx], status: 'replaced', replacedBy: video.id, updatedAt: finishedAt };
    } else {
      videos.push({ videoId: job.replaces, title: '', privacy: '', publishedAt: '', status: 'replaced', replacedBy: video.id, updatedAt: finishedAt });
    }
  }
  writeManifest({ ...m, videos });
}

export async function syncManifest() {
  const ch = await channel();
  const ids = [];
  const seen = new Set();
  let pageToken;
  for (;;) {
    const { j } = await api('GET', 'playlistItems', {
      query: { part: 'contentDetails', playlistId: ch.uploads, maxResults: 50, ...(pageToken ? { pageToken } : {}) },
    });
    for (const item of j.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
    }
    if (!j.nextPageToken || !(j.items ?? []).length) break;
    pageToken = j.nextPageToken;
  }
  const remote = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    for (const v of await videos(ids.slice(i, i + 50))) remote.set(v.id, v);
  }
  const cur = readManifest();
  const byId = new Map(cur.videos.map((e) => [e.videoId, e]));
  const nowIso = new Date(nowMs()).toISOString();
  const merged = [];
  for (const id of ids) {
    const v = remote.get(id);
    const prev = byId.get(id);
    const nextEntry = {
      ...(prev ?? {}),
      videoId: id,
      title: v?.snippet?.title ?? prev?.title ?? '',
      privacy: v?.status?.privacyStatus ?? prev?.privacy ?? '',
      publishedAt: v?.snippet?.publishedAt ?? prev?.publishedAt ?? '',
      ...(v?.statistics ? { views: Number(v.statistics.viewCount ?? 0), likes: Number(v.statistics.likeCount ?? 0) } : {}),
      status: prev?.status ?? 'ok',
      updatedAt: prev?.updatedAt ?? nowIso,
    };
    if (v?.status?.publishAt) nextEntry.publishAt = v.status.publishAt; else if (v) delete nextEntry.publishAt;
    merged.push(nextEntry);
  }
  for (const prev of cur.videos) {
    if (!seen.has(prev.videoId)) {
      merged.push({
        ...prev,
        status: 'removed',
        updatedAt: prev.status === 'removed' ? prev.updatedAt : nowIso,
      });
    }
  }
  const next = { syncedAt: nowIso, videos: merged };
  writeManifest(next);
  return next;
}

export function formatManifestTable(list, statusFilter) {
  const rows = statusFilter ? list.filter((e) => e.status === statusFilter) : list;
  if (!rows.length) return statusFilter ? `No videos with status "${statusFilter}" in manifest.` : 'Manifest is empty (run manifest with sync: true to populate it).';
  const cell = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
  const lines = ['| key | title | id | privacy | views | likes | status | replacedBy |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const e of rows) {
    lines.push(`| ${cell(e.key)} | ${cell(e.title)} | ${cell(e.videoId)} | ${cell(e.privacy)} | ${cell(e.views)} | ${cell(e.likes)} | ${cell(e.status)} | ${cell(e.replacedBy)} |`);
  }
  return lines.join('\n');
}

export function markVideo(a) {
  if (a.status !== undefined && !MANIFEST_STATUS.includes(a.status)) {
    throw new Error(`status is one of ${MANIFEST_STATUS.join(', ')}.`);
  }
  const m = readManifest();
  const videos = m.videos.slice();
  const nowIso = new Date(nowMs()).toISOString();
  const targets = [];
  if (Array.isArray(a.video_ids) && a.video_ids.length) {
    for (const id of a.video_ids) {
      const idx = videos.findIndex((e) => e.videoId === String(id));
      if (idx < 0) throw new Error(`No video ${id} in manifest (run manifest with sync: true first).`);
      targets.push(idx);
    }
  } else if (a.video_id) {
    const idx = videos.findIndex((e) => e.videoId === String(a.video_id));
    if (idx < 0) throw new Error(`No video ${a.video_id} in manifest (run manifest with sync: true first).`);
    targets.push(idx);
  } else if (a.key) {
    const idx = videos.findIndex((e) => e.key === String(a.key));
    if (idx < 0) throw new Error(`No entry with key "${a.key}" in manifest.`);
    targets.push(idx);
  } else {
    throw new Error('Pass video_id, video_ids, or key.');
  }
  const updated = [];
  for (const idx of targets) {
    const e = { ...videos[idx], updatedAt: nowIso };
    if (a.video_id && !Array.isArray(a.video_ids) && a.key !== undefined) e.key = a.key;
    if (a.status !== undefined) e.status = a.status;
    if (a.reason !== undefined) e.reason = a.reason;
    if (a.replaced_by !== undefined) e.replacedBy = a.replaced_by;
    if (a.notes !== undefined) e.notes = a.notes;
    videos[idx] = e;
    updated.push(e);
  }
  writeManifest({ ...m, videos });
  return updated.length === 1 ? updated[0] : { updated: updated.length, status: a.status };
}
