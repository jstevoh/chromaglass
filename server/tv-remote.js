/**
 * The TV's remote picks the look (PLAN 12-tv-remote): left and right step
 * through the show's presets, OK plays a random one, up opens the list.
 *
 * What was asked (2026-11-12): the TV stays a receiver, playing the Mac's
 * plate as video and drawing nothing itself, but the remote in the hand on
 * the sofa should choose what the Mac plays. So the relay, which until now
 * let a TV say nothing but its half of the video handshake, lets it say one
 * more thing: "play this preset". This file is that one thing's rules, kept
 * beside the relay (remote-server.js is past the size the repo warns at).
 *
 * Why the TV names a preset rather than sending the phone's `preset-next`:
 * the relay then knows exactly what it is passing on, and can check it. A TV
 * may only pick a preset the laptop itself listed in its last state, so a TV
 * can never reach a setting, a patch or any of the phone's other actions
 * (clear, drain, record, go live), and a key that leaked from a TV opens
 * nothing but the look. The page works out next, previous and random from
 * the same list (src/lib/tvLooks.ts), the laptop's order, which is the order
 * the desk's own preset step uses (App.tsx `stepPreset`).
 *
 * Why the TV is sent a short list of its own, `tv-looks`, and not the phone's
 * whole `state`: a TV only watches, and the state carries the show's every
 * dial, the set list and the cast's names. The TV needs the presets' names
 * for its list and which one is live, nothing more; and it is sent again only
 * when one of those changes, not every time a dial moves on the laptop.
 *
 * Why a pick is held to one every TV_PICK_MS from each TV: a preset cuts the
 * plate to clean glass and pours the new look, and a remote's held button
 * repeats ten times a second. The page ignores repeats itself; this is the
 * relay's own floor, so a TV page that does not (an old one, a stranger's
 * socket) cannot strobe the room.
 */

/** The fewest milliseconds between two picks from one TV. A press a second is a person; ten is a held button. */
export const TV_PICK_MS = 400;
/** The most presets a TV is sent, and the longest name: the laptop's library, never a flood. */
export const TV_LOOKS_MAX = 400;
export const TV_NAME_MAX = 80;

/**
 * The presets and the live one, from the laptop's `state` message, cut to
 * what a TV needs. Null when the state carries no list (an old page).
 */
export function tvLooksFrom(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.presets)) return null;
  const presets = [];
  const seen = new Set();
  for (const p of state.presets) {
    if (presets.length >= TV_LOOKS_MAX) break;
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 200 || seen.has(p.id)) continue;
    seen.add(p.id);
    presets.push({ id: p.id, name: String(typeof p.name === 'string' && p.name ? p.name : p.id).slice(0, TV_NAME_MAX) });
  }
  const active = typeof state.activePresetId === 'string' && seen.has(state.activePresetId) ? state.activePresetId : null;
  return { type: 'tv-looks', presets, active };
}

/**
 * One show server's TV remote. `onDisplayState` reads each state the laptop
 * sends and answers the `tv-looks` to send the TVs when it changed (else
 * null); `looks` is the last one, for a TV that has just joined; `pick`
 * turns a TV's `tv-pick` into the `preset` message the laptop already
 * understands from a phone, or null when it names no listed preset or comes
 * too soon after that TV's last.
 */
export function createTvRemote({ now = Date.now } = {}) {
  let last = null;
  let lastJson = '';
  const lastPick = new WeakMap();
  return {
    onDisplayState(state) {
      const looks = tvLooksFrom(state);
      if (!looks) return null;
      const json = JSON.stringify(looks);
      if (json === lastJson) return null;
      last = looks;
      lastJson = json;
      return looks;
    },
    looks: () => last,
    pick(tv, message) {
      const id = message?.presetId;
      if (!last || typeof id !== 'string' || !last.presets.some((p) => p.id === id)) return null;
      const t = now();
      const before = lastPick.get(tv);
      if (before !== undefined && t - before < TV_PICK_MS) return null;
      lastPick.set(tv, t);
      return { type: 'preset', presetId: id };
    },
  };
}
