/**
 * Recording's options and the takes for the owner's assistant (PLAN 44k-11):
 * the guard's rules for `assistant-record`.
 *
 * Why beside `assistant.js` and not in it: that file is past the 40 KB line
 * `npm run sizes` warns at, so each new piece of the guard goes in a module
 * of its own (as assistantMusic.js and assistantEar.js did).
 *
 * What the Record panel offers, and so what this takes, by the panel's own
 * names (lib/recordChoice.ts, hooks/useRecorder.ts):
 *  - what Record makes: the Plate video, a Take, or both;
 *  - the video's quality (Master, Standard, Compact), its frame rate (60 or
 *    30, the panel's two), its container (Auto, WebM, MP4) and whether the
 *    sound the show hears goes into it;
 *  - a kept Take replayed, its replay stopped, or the Take deleted.
 *
 * Judged here on the guard's copy of the display's state (a throttled
 * snapshot, so the page judges again: app/recordNow.ts `askRecord`):
 *  - a container the display's encoder cannot write is refused with the ones
 *    it can. The recorder itself would not refuse it: `pickMime` falls back
 *    from MP4 to WebM, so "make it MP4" on a browser without an MP4 encoder
 *    would quietly record WebM, and the assistant would say MP4 to the owner.
 *    The display reports what its encoder takes (`record.formats`), so the
 *    refusal can name them. Null from a display one build older: the page's
 *    own check is then the only one.
 *  - a Take is named by its number in show_state's list (1, the newest), and
 *    sent to the display by its id, so the one deleted is the one the
 *    assistant read, even if a new Take is kept between its read and its
 *    call (which moves every number by one). A number past the list is
 *    refused with how many there are, and with none kept, said so.
 * All of it is Full (the plan's 44k table): a delete cannot be undone, and
 * the options change what the owner's next press of Record writes to disk.
 */

export const RECORD_MAKES = ['video', 'take', 'both'];
export const RECORD_QUALITIES = ['master', 'standard', 'compact'];
export const RECORD_FPS = [60, 30];
export const RECORD_FORMATS = ['auto', 'webm', 'mp4'];
const RECORD_DO = ['options', 'take-replay', 'take-stop', 'take-delete'];

/** The guard's copy of the display's `record`: the containers it can write and the Takes' ids, newest first. */
export function recordOf(r) {
  if (!r || typeof r !== 'object') return null;
  return {
    formats: Array.isArray(r.formats) ? r.formats.map(String) : null,
    takes: Array.isArray(r.takes) ? r.takes.map((k) => String(k?.id ?? '')) : null,
  };
}

/** The guard's answer for one `assistant-record`: what to send the display, or why not. */
export function recordCall(message, record) {
  const d = message.do;
  if (!RECORD_DO.includes(d)) return { reason: `recording: ${RECORD_DO.join(', ')}, not ${String(d)}` };
  if (d === 'take-stop') return { out: { do: d } };
  if (d === 'options') {
    const out = { do: d };
    if (message.makes !== undefined) {
      if (!RECORD_MAKES.includes(message.makes)) return { reason: `makes: ${RECORD_MAKES.join(', ')}` };
      out.makes = message.makes;
    }
    if (message.quality !== undefined) {
      if (!RECORD_QUALITIES.includes(message.quality)) return { reason: `quality: ${RECORD_QUALITIES.join(', ')}` };
      out.quality = message.quality;
    }
    if (message.fps !== undefined) {
      if (!RECORD_FPS.includes(message.fps)) return { reason: `fps: ${RECORD_FPS.join(' or ')}, as the Record panel offers` };
      out.fps = message.fps;
    }
    if (message.format !== undefined) {
      if (!RECORD_FORMATS.includes(message.format)) return { reason: `format: ${RECORD_FORMATS.join(', ')}` };
      const can = record?.formats;
      if (message.format !== 'auto' && can && !can.includes(message.format)) {
        return { reason: `this show's encoder cannot write ${message.format} (it writes ${can.join(', ') || 'no video at all'}): choose one of those, or auto` };
      }
      out.format = message.format;
    }
    if (message.sound !== undefined) {
      if (typeof message.sound !== 'boolean') return { reason: 'sound: true or false' };
      out.sound = message.sound;
    }
    if (Object.keys(out).length === 1) return { reason: 'record_options: give at least one of makes, quality, fps, format, sound' };
    return { out };
  }
  // A Take, by its number in show_state's list.
  const n = message.take === undefined ? 1 : message.take;
  if (!Number.isInteger(n) || n < 1) return { reason: 'take: a number from show_state\'s record.takes, 1 the newest' };
  const ids = record?.takes;
  if (!ids) return { out: { do: d, take: n } };
  if (ids.length === 0) return { reason: 'no Takes are kept yet: a Take is made by Record (makes take or both) or T, and painting' };
  if (n > ids.length) return { reason: `show_state lists ${ids.length === 1 ? 'one Take' : `${ids.length} Takes`}, so there is no Take ${n}` };
  return { out: { do: d, take: n, id: ids[n - 1] } };
}
