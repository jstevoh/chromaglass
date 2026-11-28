/**
 * Caption files for a video (PLAN 44i-2b): which files count, and the one
 * request that sends one to YouTube (`captions.insert`).
 *
 * What was asked. A film with words in it (a narrated tutorial, a talk over a
 * show, sung lyrics) is watched with the sound off more often than with it on,
 * and YouTube's own automatic captions arrive late and wrong on music. The
 * person makes the file (an editor's export, a transcriber's) and this sends it,
 * at upload or later on.
 *
 * Which files. `.srt` and `.vtt`, the two every editor writes and YouTube
 * reads. A file is looked at before it is queued, since a queued upload runs
 * hours later in the drain and a bad caption file found then is found by no
 * one: it must be UTF-8 text with at least one cue (`00:00:01,000 --> ...` in
 * SubRip, a `WEBVTT` header and a `-->` line in WebVTT), and at most YouTube's
 * 100 MB. Anything else is refused at the call, with what was wrong.
 *
 * The request. `captions.insert` takes the track's snippet (the video, the
 * language, a name, draft or not) and the file together, as one
 * `multipart/related` body to the upload address; it costs 400 of the day's
 * 10,000 units, eight times an update, so the guide says so before it is run.
 * Without `uploadType=multipart` Google refuses an upload to that address.
 */
import { readFileSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

export const CAPTION = { '.srt': 'application/x-subrip', '.vtt': 'text/vtt' };
export const CAPTION_UNITS = 400;
const MAX_BYTES = 100 * 1024 * 1024;

const SRT_CUE = /\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/;
const VTT_CUE = /(?:\d{1,2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(?:\d{1,2}:)?\d{2}:\d{2}\.\d{3}/;

/** The file's bytes once it passes; throws saying what is wrong with it. */
export function readCaptionFile(path) {
  const size = statSync(path).size;
  if (size > MAX_BYTES) throw new Error(`${path} is ${Math.round(size / 1048576)} MB; YouTube takes a caption file of at most 100 MB.`);
  const bytes = readFileSync(path);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error(`${path} is not UTF-8 text; save it as UTF-8 from the editor.`); }
  const body = text.replace(/^﻿/, '');
  if (path.toLowerCase().endsWith('.vtt')) {
    if (!/^WEBVTT(?:[ \t].*)?(?:\r?\n|$)/.test(body)) throw new Error(`${path} does not start with WEBVTT, so it is not a WebVTT file.`);
    if (!VTT_CUE.test(body)) throw new Error(`${path} has no cue (a line like 00:01.000 --> 00:04.000).`);
  } else if (!SRT_CUE.test(body)) {
    throw new Error(`${path} has no cue (a line like 00:00:01,000 --> 00:00:04,000).`);
  }
  return bytes;
}

/** The `multipart/related` body for `captions.insert`: the snippet, then the file. */
export function captionRequest({ videoId, language, name = '', draft = false }, bytes) {
  const boundary = `sendreel-${randomBytes(12).toString('hex')}`;
  const meta = JSON.stringify({ snippet: { videoId, language, name, isDraft: Boolean(draft) } });
  const raw = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { raw, type: `multipart/related; boundary=${boundary}` };
}
