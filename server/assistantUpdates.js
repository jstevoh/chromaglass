/**
 * The Mac app's updates for the owner's assistant (PLAN 44k-18, 13-update-auto):
 * the relay's rules for `assistant-updates`.
 *
 * Asked 2026-11-11 with the switch itself: Install Updates Automatically, on or
 * off, "exposed to Claude's app control too". The updater is the Mac app's
 * main process's (desktop/updates.js), not the page's, so unlike the other
 * assistant calls this one never goes to the display: main.js hands the show
 * server the updater's doors (`setAppUpdates`, its `updatesHook`), and the
 * relay answers from them at once, with the updater's state in the answer.
 * A show run from a terminal (`npm run show`) has no updater, and says so.
 *
 * What is judged here:
 *  - status reads the updater's state, in any mode: it changes nothing;
 *  - auto (the switch), check and install change the app, so Full, as the
 *    room's own settings are;
 *  - auto takes a boolean and nothing else;
 *  - install never restarts the app in the middle of a show: the updater
 *    refuses while the show is on the projector or live (updates.js
 *    `install`), and its reason comes back to the assistant as the refusal.
 * Why beside assistant.js and not in it: that file is past the 40 KB line
 * `npm run sizes` warns at (as assistantEar.js and assistantRecord.js are).
 */

export const UPDATES_DO = ['status', 'auto', 'check', 'install'];

const RANK = { off: 0, suggest: 1, play: 2, full: 3 };

/** The relay's answer to one `assistant-updates`: `{ ok, reason?, updates? }`. */
export function updatesCall(message, mode, hook) {
  const d = message?.do;
  if (!UPDATES_DO.includes(d)) return { ok: false, reason: `the Mac app's updates: ${UPDATES_DO.join(', ')}, not ${String(d)}` };
  if (d !== 'status' && (RANK[mode] ?? 0) < RANK.full) return { ok: false, reason: `Full mode is needed (the show is in ${mode}): the Mac app's updates change the app itself` };
  if (!hook) return { ok: false, reason: 'updates are the Mac app\'s, and this show is not running in it' };
  if (d === 'auto') {
    if (typeof message.on !== 'boolean') return { ok: false, reason: 'auto: on, as true or false' };
    hook.setAuto(message.on);
  } else if (d === 'check') {
    hook.check();
  } else if (d === 'install') {
    const why = hook.install();
    if (why) return { ok: false, reason: why, updates: hook.state() };
  }
  return { ok: true, updates: hook.state() };
}
