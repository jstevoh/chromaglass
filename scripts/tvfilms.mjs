#!/usr/bin/env node
/**
 * The TV's sample films: put them where the TVs fetch them, and prove they are there.
 *
 *   npm run tvfilms -- --from <dir>     on the Mac that rendered them: upload
 *   npm run tvfilms -- --probe          anywhere: does the site serve all six?
 *   npm run tvfilms -- --probe --release   the same, asked of the release itself
 *
 * What was asked (the owner, 2026-11-14; PLAN 12-tv-2f): the TV app's samples
 * to be the channel's films, longer and better than the two press clips.
 * src/lib/tvFilms.ts says why the files are a release of this repository and
 * the site's /films/<id>.mp4 a redirect to it (firebase.json).
 *
 * Upload. `<dir>` is where the sitefilms script (PLAN 34a-6) put the films (SITEFILMS_OUT,
 * scratch/sitefilms/ by default: `<dir>/<id>/film.mp4`), or a folder of
 * `<id>.mp4`. Each film is checked before it goes (H.264 and AAC, which every
 * TV's own player decodes in hardware, at least 1280 wide and two minutes
 * long, which the press clips were not), then copied with its index moved to
 * the front of the file (`-movflags +faststart`, no re-encode: the frames are
 * the channel's, bit for bit), so a TV starts playing after the first few
 * hundred kilobytes rather than after fetching the end of a 150 MB file for
 * its index. They go to the release `TV_FILMS_RELEASE`, made if it is not
 * there as a pre-release that is never "latest": the Mac app's updater reads
 * the latest release (desktop/updates.js), and must never take this one for a
 * new version. Needs `gh` signed in with write access to the repository.
 *
 * Probe. For each film, the first 64 KB of `https://chromaglass.art/films/<id>.mp4`
 * (or of the release's own address with `--release`, before the redirect is
 * deployed), following redirects as a TV's player does. It passes when the
 * answer is the film's bytes: a 206 with the whole file's size over 20 MB, an
 * MP4 (`ftyp` at byte 4) whose index (`moov`) is in those first 64 KB. A
 * redirect to a missing file, an HTML error page or an index at the end each
 * fail, and each is what a TV would show as "could not play".
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TV_FILMS, TV_FILMS_RELEASE, tvFilmUrl } from '../src/lib/tvFilms.ts';

const REPO = 'jstevoh/chromaglass';
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const MB = (b) => `${(b / 1e6).toFixed(1)} MB`;

if (flag('--probe')) {
  const release = flag('--release');
  for (const f of TV_FILMS) {
    const url = release ? `https://github.com/${REPO}/releases/download/${TV_FILMS_RELEASE}/${f.id}.mp4` : tvFilmUrl(f);
    try {
      const r = await fetch(url, { headers: { Range: 'bytes=0-65535' }, redirect: 'follow' });
      const buf = Buffer.from(await r.arrayBuffer());
      const total = Number((r.headers.get('content-range') ?? '').split('/')[1] ?? 0);
      const isMp4 = buf.subarray(4, 8).toString('latin1') === 'ftyp';
      const moovFirst = buf.indexOf('moov', 0, 'latin1') > 0;
      check(`${f.id}: the film, its index first`, r.status === 206 && total > 20e6 && isMp4 && moovFirst,
        `${r.status}, ${total ? MB(total) : 'no size'}, ${isMp4 ? 'mp4' : 'not an mp4'}, index ${moovFirst ? 'first' : 'not in the first 64 KB'} (${new URL(r.url).host})`);
    } catch (e) {
      check(`${f.id}: the film, its index first`, false, String(e?.message ?? e));
    }
  }
} else {
  const from = value('--from');
  if (!from) { console.error('tvfilms: --from <dir> (where sitefilms put the films) or --probe'); process.exit(2); }
  const out = path.resolve('scratch/tvfilms');
  fs.mkdirSync(out, { recursive: true });
  const ready = [];
  for (const f of TV_FILMS) {
    const src = [path.join(from, f.id, 'film.mp4'), path.join(from, `${f.id}.mp4`)].find((p) => fs.existsSync(p));
    if (!src) { check(`${f.id}: found`, false, `no ${f.id}/film.mp4 or ${f.id}.mp4 in ${from}`); continue; }
    const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', src], { encoding: 'utf8' }));
    const v = p.streams.find((s) => s.codec_type === 'video'), a = p.streams.find((s) => s.codec_type === 'audio');
    const dur = Number(p.format.duration);
    const ok = v?.codec_name === 'h264' && a?.codec_name === 'aac' && v.width >= 1280 && dur >= 120;
    check(`${f.id}: H.264 and AAC, at least 1280 wide and two minutes`, ok,
      `${v?.codec_name} ${v?.width}×${v?.height} ${v?.r_frame_rate}, ${a?.codec_name ?? 'no audio'}, ${dur.toFixed(1)} s, ${MB(Number(p.format.size))}, ${(Number(p.format.bit_rate) / 1e6).toFixed(1)} Mb/s`);
    if (!ok) continue;
    const dst = path.join(out, `${f.id}.mp4`);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-movflags', '+faststart', dst]);
    const head = Buffer.alloc(65536);
    const fd = fs.openSync(dst, 'r'); fs.readSync(fd, head, 0, head.length, 0); fs.closeSync(fd);
    check(`${f.id}: index moved to the front`, head.indexOf('moov', 0, 'latin1') > 0, MB(fs.statSync(dst).size));
    ready.push(dst);
  }
  if (results.every(Boolean) && ready.length === TV_FILMS.length) {
    const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    let exists = true;
    try { gh('release', 'view', TV_FILMS_RELEASE, '--repo', REPO, '--json', 'tagName'); } catch { exists = false; }
    if (!exists) {
      gh('release', 'create', TV_FILMS_RELEASE, '--repo', REPO, '--prerelease', '--latest=false', '--target', 'main',
        '--title', 'TV sample films',
        '--notes', 'The films the ChromaGlass TV app and TV page play with no show running: six pieces of Scott Buckley\'s ambient music (CC BY 4.0), each played whole by one look. Served at https://chromaglass.art/films/<id>.mp4 (PLAN 12-tv-2f). Not an app release.');
    }
    gh('release', 'upload', TV_FILMS_RELEASE, '--repo', REPO, '--clobber', ...ready);
    check(`uploaded ${ready.length} films to the release ${TV_FILMS_RELEASE}${exists ? '' : ' (made as a pre-release)'}`, true);
  }
}
const failed = results.filter((ok) => !ok).length;
console.log(`tvfilms: ${results.length - failed} of ${results.length} ok`);
process.exit(failed ? 1 : 0);
