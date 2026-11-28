/**
 * The release plan (PLAN 44i-9), moved out of youtube-mcp.js unchanged (44i-2c-2).
 *
 * Why it moved: the same ceiling as the manifest's (see manifest.js). The release
 * plan schedules live private videos and queued jobs at a clock time in the
 * settings' zone; it reads the queue and the manifest and calls the server's
 * `updateVideo`, so it takes those from the server through `bindRelease`, once at
 * start, and every line below is the one the server had.
 */
import { readManifest, readManifestStrict, writeManifest } from './manifest.js';

let ZONE, PRIVACY, nowMs, readStoreStrict, writeStore, videos, updateVideo, zoneWall, formatLocal;
/** The server's zone, privacy words, clock, queue, and Google calls; set once at start. */
export function bindRelease(deps) {
  ({ ZONE, PRIVACY, nowMs, readStoreStrict, writeStore, videos, updateVideo, zoneWall, formatLocal } = deps);
}

export function parseReleasePlanArgs(a) {
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(a.start ?? '').trim());
  if (!startMatch) throw new Error(`start must be a date in YYYY-MM-DD (${ZONE} time).`);
  const y = Number(startMatch[1]), mo = Number(startMatch[2]), d = Number(startMatch[3]);
  const checkDate = new Date(Date.UTC(y, mo - 1, d));
  if (checkDate.getUTCFullYear() !== y || checkDate.getUTCMonth() !== mo - 1 || checkDate.getUTCDate() !== d) {
    throw new Error(`Invalid start date: ${a.start}.`);
  }
  const atStr = String(a.at ?? '10:00').trim();
  const atMatch = /^(\d{1,2}):(\d{2})$/.exec(atStr);
  if (!atMatch) throw new Error(`at must be a 24-hour clock time in ${ZONE} like "10:00".`);
  const h = Number(atMatch[1]), min = Number(atMatch[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) throw new Error(`Invalid clock time: ${atStr}.`);
  const every = a.every === undefined ? 24 : Number(a.every);
  if (!Number.isFinite(every) || every <= 0) throw new Error('every must be a positive number of hours.');
  const privacy = a.privacy ?? 'public';
  if (!PRIVACY.includes(privacy)) throw new Error(`privacy is one of ${PRIVACY.join(', ')}.`);
  if (privacy !== 'public') throw new Error('YouTube only schedules a private video to become public at publishAt (privacy must be "public").');
  return { y, mo, d, h, min, every, privacy, dryRun: Boolean(a.dry_run) };
}

export async function releasePlan(a) {
  const { y, mo, d, h, min, every, dryRun } = parseReleasePlanArgs(a);
  const keys = Array.isArray(a.keys) ? a.keys.map(String) : [];
  const videoIds = Array.isArray(a.video_ids) ? a.video_ids.map(String) : [];
  if (!keys.length && !videoIds.length) throw new Error('Pass keys or video_ids.');

  const store = readStoreStrict();
  const manifest = readManifestStrict();
  const targets = [];
  for (const key of keys) {
    const activeJob = store.jobs.find((j) => j.key === key && (j.state === 'queued' || j.state === 'uploading'));
    if (activeJob) {
      targets.push({ kind: 'job', key, job: activeJob });
      continue;
    }
    const entry = manifest.videos.find((e) => e.key === key && e.status !== 'replaced' && e.status !== 'removed');
    if (entry) {
      targets.push({ kind: 'video', key, videoId: entry.videoId });
      continue;
    }
    const anyEntry = manifest.videos.find((e) => e.key === key);
    if (anyEntry) throw new Error(`Key "${key}" only matches a ${anyEntry.status} video (${anyEntry.videoId}).`);
    throw new Error(`No video or queued job with key "${key}".`);
  }
  for (const videoId of videoIds) {
    targets.push({ kind: 'video', videoId });
  }

  const upIds = [...new Set(targets.filter((t) => t.kind === 'video').map((t) => t.videoId))];
  const fetched = new Map();
  for (let i = 0; i < upIds.length; i += 50) {
    for (const v of await videos(upIds.slice(i, i + 50))) fetched.set(v.id, v);
  }
  for (const id of upIds) {
    if (!fetched.has(id)) throw new Error(`No video ${id} on this channel.`);
  }

  const slot0Ms = zoneWall(y, mo, d, h, min, 0);
  const warnings = [];
  const plan = targets.map((t, i) => {
    const slotMs = every % 24 === 0
      ? zoneWall(y, mo, d + i * (every / 24), h, min, 0)
      : slot0Ms + i * every * 3600_000;
    const publishAt = new Date(slotMs).toISOString();
    const when = formatLocal(slotMs);
    if (t.kind === 'job') {
      const warn = t.job.state !== 'queued' ? `Job ${t.job.id} is currently ${t.job.state}; cannot change publish_at until queued or uploaded.` : undefined;
      if (warn) warnings.push(warn);
      return {
        kind: 'queued_job',
        job: t.job.id,
        ...(t.key ? { key: t.key } : {}),
        title: t.job.meta?.snippet?.title,
        publish_at: publishAt,
        when,
        quota_units: 0,
        ...(warn ? { warning: warn } : {}),
      };
    }
    const v = fetched.get(t.videoId);
    const curPrivacy = v.status?.privacyStatus;
    const warn = curPrivacy !== 'private' ? `Video ${t.videoId} ("${v.snippet?.title}") is already ${curPrivacy}; YouTube only schedules a private video.` : undefined;
    if (warn) warnings.push(warn);
    return {
      kind: 'video',
      video_id: t.videoId,
      ...(t.key ? { key: t.key } : {}),
      title: v.snippet?.title,
      current_privacy: curPrivacy,
      publish_at: publishAt,
      when,
      quota_units: 50,
      ...(warn ? { warning: warn } : {}),
    };
  });

  const videoCount = plan.filter((p) => p.kind === 'video').length;
  const jobCount = plan.length - videoCount;
  const quotaCost = videoCount * 50;
  const costNote = `${videoCount} live video update(s) × 50 units = ${quotaCost} quota units (${jobCount} queued job(s) × 0 units).`;

  if (dryRun) {
    return { dry_run: true, quota_cost: quotaCost, cost_note: costNote, ...(warnings.length ? { warnings } : {}), plan };
  }
  if (warnings.length) {
    throw new Error(`${warnings.join(' ')} No videos or jobs were changed.`);
  }

  for (const item of plan) {
    if (item.kind === 'video') {
      await updateVideo({ video_id: item.video_id, publish_at: item.publish_at });
    } else {
      const idx = store.jobs.findIndex((j) => j.id === item.job);
      if (idx >= 0) {
        store.jobs[idx] = {
          ...store.jobs[idx],
          meta: {
            ...store.jobs[idx].meta,
            status: { ...store.jobs[idx].meta.status, privacyStatus: 'private', publishAt: item.publish_at },
          },
        };
      }
    }
  }
  if (jobCount > 0) writeStore(store);
  if (videoCount > 0) {
    const curManifest = readManifest();
    let changed = false;
    const nowIso = new Date(nowMs()).toISOString();
    for (const item of plan) {
      if (item.kind !== 'video') continue;
      const idx = curManifest.videos.findIndex((e) => e.videoId === item.video_id);
      if (idx >= 0) {
        curManifest.videos[idx] = { ...curManifest.videos[idx], privacy: 'private', publishAt: item.publish_at, updatedAt: nowIso };
        changed = true;
      }
    }
    if (changed) writeManifest(curManifest);
  }
  return { dry_run: false, quota_cost: quotaCost, cost_note: costNote, updated_videos: videoCount, updated_jobs: jobCount, plan };
}
