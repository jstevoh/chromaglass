/**
 * The assistant role's guard (PLAN 44b, 44d): what an AI assistant joined to
 * the show server may do, how often, and how to take it back.
 *
 * The owner's own tool, not a feature anyone else sees (2026-11-07): it stays
 * dormant unless the owner's switch is on (`readAssistantMode`), and nothing in
 * the app's menus, the guide or the site points at it.
 *
 * Why the rules live here, in the relay, and not in the program the assistant
 * talks to (`mcp/chromaglass-mcp.js`): that program is the side the assistant
 * drives, and a rule it enforces is a rule an assistant could talk its way
 * round, or that a different MCP server would simply not have. The relay is
 * the one door every assistant message passes through, it runs in the show's
 * own process on the owner's Mac, and it can be checked in node with nothing
 * but sockets (`npm run assistant`), where the same rules inside the page
 * could only be checked by running the app. The page still does its own part:
 * `sanitizePatch` clamps every value, and a look the assistant arms never
 * carries the room (`src/lib/assistantLook.ts`).
 *
 * The modes, from the owner's switch:
 *  - off: the role is refused, and a connected assistant is closed.
 *  - suggest: it sees the show, arms a look (one of the library's, or a new
 *    one it made), and the performer presses Go. The plate is untouched.
 *  - play: also Go, look settings glided, the hand's gestures, the sequencer's
 *    transport, and Undo.
 *  - full (the owner, 2026-11-07: "let's not limit Claude's ability to control
 *    anything"): everything a person at the desk can do, the room's settings,
 *    blackout, clear, drain, recording and the live stream included.
 *
 * What holds in every mode, because it takes nothing away: a setting glides
 * rather than jumps, the last ten changes can be undone, and a setting the
 * performer moved in the last ten seconds is left to their hand, so the
 * assistant never fights a fader under a finger. Suggest and Play also cap how
 * often (a look change every 4 s, four setting changes and ten gestures a
 * second); Full keeps only a flood cap, so a runaway loop cannot hammer the
 * room. Each refusal says why, and the assistant reads it.
 *
 * Plain functions and maps, one guard per show server; nothing here runs in
 * the frame loop.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ASSISTANT_MODES = ['off', 'suggest', 'play', 'full'];

/** The most recent look change a Suggest or Play assistant may follow, in ms. */
export const LOOK_GAP_MS = 4_000;
/** Setting changes (and arms) in any one second, Suggest and Play. */
export const PATCHES_PER_S = 4;
/** The hand's gestures in any one second, Suggest and Play. */
export const GESTURES_PER_S = 10;
/** Everything in any one second, in Full: a flood cap, not a pace. */
export const FULL_PER_S = 30;
/** How long a setting the performer moved is theirs alone. */
export const HAND_MS = 10_000;
/** How many of the assistant's changes Undo can walk back. */
export const UNDO_DEPTH = 10;
/** A glide's length, seconds: never a jump, never a crawl nobody asked for. */
export const GLIDE_MIN_S = 0.5;
export const GLIDE_DEFAULT_S = 1;
export const GLIDE_MAX_S = 30;
const GLIDE_TICK_MS = 66;
/**
 * A value the display reports within this long of the assistant sending it is
 * the assistant's own echo, not the performer's hand: the display's snapshot
 * is throttled and runs a little behind, and reading a glide's echo as a
 * performer's move would lock the assistant out of the key it just moved.
 */
const ECHO_MS = 1_500;

/**
 * The room's settings: the rig and the setup, never moved by a look
 * (`RIG_KEYS` and `SETUP_KEYS` in `src/lib/lookFade.ts`). The relay cannot
 * import the page's code, so the list is written out beside this file by
 * `node scripts/assistant.mjs --write`, and `npm run assistant` fails when it
 * no longer matches the page's.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOM_KEYS = new Set(JSON.parse(readFileSync(join(HERE, 'assistant-room-keys.json'), 'utf8')));

const GESTURES = new Set(['drop', 'blow', 'press', 'finger', 'spin', 'tilt', 'dye', 'liquid']);
const PLAY_ACTIONS = new Set(['go', 'seq-play', 'seq-pause', 'seq-next', 'seq-prev', 'seq-stop']);
/** Full only: what a person at the desk can do that a Play assistant cannot. */
const FULL_ACTIONS = new Set([
  'play', 'pause', 'seed', 'clear', 'drain', 'lucky', 'automate-on', 'automate-off',
  'overlays-off', 'overlays-on', 'preset-next', 'preset-prev', 'blackout-toggle',
  'record-toggle', 'live-start', 'live-test', 'live-stop', 'performance-toggle', 'back',
  'mix-fade-led', 'mix-fade-gel', 'mix-fade-lumia', 'mix-fade-front', 'mix-fade-back',
  'mix-fade-film', 'mix-fade-mark',
]);
const RANK = { off: 0, suggest: 1, play: 2, full: 3 };

/**
 * The owner's switch. `CHROMAGLASS_ASSISTANT` (off, suggest, play or full)
 * wins; otherwise one word in a file (`CHROMAGLASS_ASSISTANT_FILE`, which the
 * Mac app points into its own userData folder). Anything else, or no file at
 * all, is off: every customer's show has neither.
 */
export function readAssistantMode(env, file) {
  let word = env.CHROMAGLASS_ASSISTANT;
  if (word === undefined) {
    try { word = readFileSync(file, 'utf8'); } catch { word = 'off'; }
  }
  word = String(word).trim().toLowerCase();
  return ASSISTANT_MODES.includes(word) ? word : 'off';
}

const numeric = (v) => typeof v === 'number' && Number.isFinite(v);
const same = (a, b) => (numeric(a) && numeric(b) ? Math.abs(a - b) < 1e-9 : a === b);

/**
 * One guard for one show. `send(message)` goes to the display. `now` is the
 * clock, a parameter so nothing here reads time on its own.
 */
export function createAssistantGuard(send, now = Date.now) {
  /** The display's settings as last reported, with the assistant's own sends laid over. */
  let settings = null;
  let fadeSeconds = 2;
  const handAt = new Map();        // key -> when the performer last moved it
  const sentAt = new Map();        // key -> when the assistant last sent it
  const sentValue = new Map();     // key -> what it sent
  const glides = new Map();        // key -> { from, to, start, ms }
  let glideTimer = null;
  let quietUntil = 0;              // a look fade the assistant started: its moves are not the hand's
  let lastLook = -Infinity;
  const recent = { patch: [], gesture: [], all: [] };
  const undo = [];

  const refuse = (reason) => ({ ok: false, reason });
  const within = (list, limit, t) => {
    while (list.length && t - list[0] >= 1000) list.shift();
    return list.length < limit;
  };
  const stamp = (list, t) => { list.push(t); };

  const sendPatch = (patch, t) => {
    for (const [k, v] of Object.entries(patch)) { sentAt.set(k, t); sentValue.set(k, v); if (settings) settings[k] = v; }
    send({ type: 'patch', settings: patch });
  };

  const tick = () => {
    const t = now();
    const patch = {};
    for (const [k, g] of glides) {
      const u = Math.min(1, (t - g.start) / g.ms);
      // Smoothstep: a glide that starts and lands without a kick.
      const e = u * u * (3 - 2 * u);
      patch[k] = u >= 1 ? g.to : g.from + (g.to - g.from) * e;
      if (u >= 1) glides.delete(k);
    }
    if (Object.keys(patch).length) sendPatch(patch, t);
    if (glides.size === 0 && glideTimer) { clearInterval(glideTimer); glideTimer = null; }
  };

  /** Glide each numeric key to its target; anything else is set at once (a choice has no halfway). */
  const glideTo = (target, seconds, t) => {
    const ms = Math.min(GLIDE_MAX_S, Math.max(GLIDE_MIN_S, numeric(seconds) ? seconds : GLIDE_DEFAULT_S)) * 1000;
    const now0 = {};
    for (const [k, v] of Object.entries(target)) {
      const from = currentOf(k, settings?.[k], t);
      if (numeric(v) && numeric(from)) glides.set(k, { from, to: v, start: t, ms });
      else { glides.delete(k); now0[k] = v; }
    }
    if (Object.keys(now0).length) sendPatch(now0, t);
    if (glides.size && !glideTimer) { glideTimer = setInterval(tick, GLIDE_TICK_MS); glideTimer.unref?.(); }
    tick();
  };
  /** Where a key is now, mid-glide included. */
  const currentOf = (k, fallback, t) => {
    const g = glides.get(k);
    if (!g) return fallback;
    const u = Math.min(1, (t - g.start) / g.ms);
    return g.from + (g.to - g.from) * u * u * (3 - 2 * u);
  };
  const remember = (entry) => {
    undo.push(entry);
    if (undo.length > UNDO_DEPTH) undo.shift();
  };

  /** Settings the assistant names that it may not move now, and why. */
  const blocked = (keys, mode, t) => {
    const unknown = settings ? keys.filter((k) => !Object.prototype.hasOwnProperty.call(settings, k)) : [];
    if (unknown.length) return `not settings of this show: ${unknown.join(', ')}`;
    const room = mode === 'full' ? [] : keys.filter((k) => ROOM_KEYS.has(k));
    if (room.length) return `the room's settings (${room.join(', ')}) need Full mode`;
    const held = keys.filter((k) => t - (handAt.get(k) ?? -Infinity) < HAND_MS);
    if (held.length) return `the performer moved ${held.join(', ')} in the last ${HAND_MS / 1000} s; their hand wins`;
    return null;
  };

  const paced = (kind, mode, t) => {
    if (mode === 'full') return within(recent.all, FULL_PER_S, t) ? null : 'too fast: Full allows 30 changes a second';
    if (kind === 'gesture') return within(recent.gesture, GESTURES_PER_S, t) ? null : `too fast: at most ${GESTURES_PER_S} gestures a second`;
    if (kind === 'patch') return within(recent.patch, PATCHES_PER_S, t) ? null : `too fast: at most ${PATCHES_PER_S} setting changes a second`;
    return null;
  };
  const count = (kind, mode, t) => { stamp(mode === 'full' ? recent.all : kind === 'gesture' ? recent.gesture : recent.patch, t); };

  const needs = (mode, least) => (RANK[mode] >= RANK[least] ? null : `${least === 'full' ? 'Full' : least === 'play' ? 'Play' : 'Suggest'} mode is needed (the show is in ${mode})`);

  const lookChange = (mode, t) => {
    if (mode !== 'full' && t - lastLook < LOOK_GAP_MS) return `a look change at most every ${LOOK_GAP_MS / 1000} s`;
    return null;
  };
  const lookStarted = (t) => { lastLook = t; quietUntil = t + fadeSeconds * 1000 + ECHO_MS; remember({ kind: 'go' }); };

  return {
    /** The display's snapshot: what the plate is set to, and what the performer moved since. */
    onDisplayState(state) {
      const next = state && typeof state === 'object' ? state.settings : null;
      if (!next || typeof next !== 'object') return;
      if (numeric(state.fadeSeconds)) fadeSeconds = state.fadeSeconds;
      const t = now();
      if (settings) {
        for (const [k, v] of Object.entries(next)) {
          if (same(settings[k], v)) continue;
          const echo = glides.has(k) || (sentValue.has(k) && same(sentValue.get(k), v)) || t - (sentAt.get(k) ?? -Infinity) < ECHO_MS || t < quietUntil;
          if (!echo) handAt.set(k, t);
        }
      }
      settings = { ...next };
    },

    /** A phone's, OSC's or Art-Net's message on its way to the display: a patch is the hand. */
    onPerformer(message) {
      if (!message || message.type !== 'patch' || !message.settings || typeof message.settings !== 'object') return;
      const t = now();
      for (const k of Object.keys(message.settings)) { handAt.set(k, t); glides.delete(k); }
    },

    /** One of the assistant's messages: sent on to the display, or refused with the reason. */
    handle(message, mode) {
      const t = now();
      if (mode === 'off') return refuse('the assistant is switched off');
      const type = message?.type;

      if (type === 'cue' || type === 'cue-look') {
        const why = paced('patch', mode, t);
        if (why) return refuse(why);
        if (type === 'cue') {
          if (typeof message.presetId !== 'string' && message.presetId !== null) return refuse('a look id is needed');
          count('patch', mode, t);
          send({ type: 'cue', presetId: message.presetId });
          return { ok: true };
        }
        const keys = message.settings && typeof message.settings === 'object' ? Object.keys(message.settings) : [];
        const room = mode === 'full' ? [] : keys.filter((k) => ROOM_KEYS.has(k));
        if (room.length) return refuse(`a look never carries the room's settings (${room.join(', ')})`);
        count('patch', mode, t);
        send({ type: 'cue-look', name: String(message.name ?? 'From the assistant').slice(0, 60), base: typeof message.base === 'string' ? message.base : null, settings: message.settings ?? {} });
        return { ok: true };
      }

      if (type === 'patch') {
        const why = needs(mode, 'play') ?? paced('patch', mode, t);
        if (why) return refuse(why);
        const target = message.settings && typeof message.settings === 'object' ? message.settings : {};
        const keys = Object.keys(target);
        if (keys.length === 0) return refuse('no settings named');
        const no = blocked(keys, mode, t);
        if (no) return refuse(no);
        count('patch', mode, t);
        const before = {};
        for (const k of keys) before[k] = currentOf(k, settings?.[k], t);
        remember({ kind: 'patch', before });
        glideTo(target, message.glide, t);
        return { ok: true };
      }

      if (type === 'assistant-undo') {
        const why = needs(mode, 'play');
        if (why) return refuse(why);
        const entry = undo.pop();
        if (!entry) return refuse('nothing to undo');
        if (entry.kind === 'go') {
          // The display's own Back: the look before, over the desk's fade.
          send({ type: 'action', action: 'back' });
          quietUntil = t + fadeSeconds * 1000 + ECHO_MS;
          return { ok: true, undid: 'look' };
        }
        if (entry.kind === 'action') {
          // A toggle undoes itself.
          send({ type: 'action', action: entry.action });
          return { ok: true, undid: entry.action };
        }
        // A key the performer has moved since is theirs now, Undo included.
        const back = {};
        for (const [k, v] of Object.entries(entry.before)) if (v !== undefined && t - (handAt.get(k) ?? -Infinity) >= HAND_MS) back[k] = v;
        if (Object.keys(back).length) glideTo(back, GLIDE_MIN_S, t);
        return { ok: true, undid: Object.keys(back) };
      }

      if (type === 'action') {
        const action = message.action;
        if (PLAY_ACTIONS.has(action)) {
          const why = needs(mode, 'play');
          if (why) return refuse(why);
          if (action === 'go') {
            const gap = lookChange(mode, t);
            if (gap) return refuse(gap);
            lookStarted(t);
          }
          send({ type: 'action', action });
          return { ok: true };
        }
        if (FULL_ACTIONS.has(action)) {
          const why = needs(mode, 'full');
          if (why) return refuse(why);
          const pace = paced('patch', mode, t);
          if (pace) return refuse(pace);
          count('patch', mode, t);
          if (action === 'blackout-toggle') remember({ kind: 'action', action });
          // The stream has its own message, which the relay takes from no one
          // but this guard: a phone may end a stream and never start one.
          if (action === 'live-start' || action === 'live-test') send({ type: 'assistant-live', test: action === 'live-test' });
          else send({ type: 'action', action });
          return { ok: true };
        }
        return refuse(`no such action: ${String(action)}`);
      }

      if (type === 'preset') {
        const why = needs(mode, 'full');
        if (why) return refuse(why);
        if (typeof message.presetId !== 'string') return refuse('a look id is needed');
        lookStarted(t);
        send({ type: 'preset', presetId: message.presetId });
        return { ok: true };
      }

      if (GESTURES.has(type)) {
        const why = needs(mode, 'play') ?? paced('gesture', mode, t);
        if (why) return refuse(why);
        count('gesture', mode, t);
        send(message);
        return { ok: true };
      }

      return refuse(`not something the assistant can send: ${String(type)}`);
    },

    stop() { if (glideTimer) clearInterval(glideTimer); glideTimer = null; glides.clear(); },
  };
}
