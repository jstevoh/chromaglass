/**
 * The ffmpeg a self-test makes its clips with (PLAN 47x-6): which sound
 * encoder the build has, and its version for a message that says which build
 * it was. Beside watch.mjs (its self-test) and used by watchcardtest.mjs.
 */
import { spawnSync } from 'node:child_process';

/**
 * The sound encoder the self-tests' clips are made with, as ffmpeg arguments
 * (47x-6). libvorbis first, which every clip was made and measured with
 * until now; then libopus, what Chrome's MediaRecorder itself writes into a
 * WebM, and what Homebrew's default ffmpeg has when it has no libvorbis (the
 * owner's Mac, 2026-11-22: the self-test could not make one clip). Null when
 * the build has neither, and the caller says so with the version it found.
 */
export function clipAudio(ffPath) {
  const r = spawnSync(ffPath, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const has = name => new RegExp(`^\\s*A\\S*\\s+${name}\\s`, 'm').test(r.stdout ?? '');
  for (const enc of ['libvorbis', 'libopus']) if (has(enc)) return ['-c:a', enc];
  return null;
}

/** The first line of `ffmpeg -version`, for a self-test to say which build it ran on. */
export function ffmpegVersion(ffPath) {
  return (spawnSync(ffPath, ['-version'], { encoding: 'utf8' }).stdout ?? '').split('\n')[0].trim() || 'unknown ffmpeg';
}
