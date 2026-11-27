/**
 * Calibrate, the song detector and Listen for the owner's assistant (PLAN
 * 44k-10): the guard's rules for `assistant-ear`.
 *
 * Why beside `assistant.js` and not in it: that file is past the 40 KB line
 * `npm run sizes` warns at, so each new piece of the guard goes in a module
 * of its own (as assistantMusic.js did).
 *
 * What is judged here, on the guard's copy of the display's state (a
 * throttled snapshot, so the page judges again: app/earNow.ts `askEar`):
 *  - calibrate is the Sound panel's Recalibrate room, which the panel shows
 *    only while Auto Calibrate is on. With it off the ear does not calibrate
 *    at all, so the press would restart the ear for nothing: refused, with
 *    the setting that turns it on.
 *  - the detector takes on or off as a boolean, nothing else.
 *  - Name it takes a title and an artist, both, as the Songs panel's two
 *    boxes do, cut to the length those boxes are read at.
 * All of it is Full (the plan's 44k table): Listen turns the detector and
 * Follow songs on and writes a song show and a sequence, and a calibration
 * restarts the ear the whole show listens with.
 */

const EAR_DO = ['calibrate', 'detector', 'listen-start', 'listen-cancel', 'listen-name'];
/** As app/earNow.ts `LISTEN_NAME_MAX`. */
const NAME_MAX = 120;

/** The guard's answer for one `assistant-ear`: what to send the display, or why not. */
export function earCall(message, settings) {
  const d = message.do;
  if (!EAR_DO.includes(d)) return { reason: `the ear: ${EAR_DO.join(', ')}, not ${String(d)}` };
  if (d === 'calibrate') {
    if (settings && settings.autoCalibrate === false) return { reason: 'Auto Calibrate is off, so the ear does not calibrate: set autoCalibrate to true first (Full)' };
    return { out: { do: 'calibrate' } };
  }
  if (d === 'detector') return typeof message.on === 'boolean' ? { out: { do: 'detector', on: message.on } } : { reason: 'song_detection: on, as true or false' };
  if (d === 'listen-name') {
    const title = typeof message.title === 'string' ? message.title.trim().slice(0, NAME_MAX) : '';
    const artist = typeof message.artist === 'string' ? message.artist.trim().slice(0, NAME_MAX) : '';
    if (!title || !artist) return { reason: 'name: the song\'s title and its artist, both' };
    return { out: { do: 'listen-name', title, artist } };
  }
  return { out: { do: d } };
}
