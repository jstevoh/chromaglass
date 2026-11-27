/**
 * Pairing a TV with four digits (PLAN 12-tv-2), so a TV app joins the show
 * without anyone typing an eight-digit key with a remote.
 *
 * How it goes: a TV that has no key says hello asking to pair; the relay
 * gives it four digits to show, and tells the laptop's page "a TV wants to
 * join: 4821". The person at the laptop, looking at both screens, presses
 * Allow; the relay hands that TV a key of its own, which the TV keeps, and
 * from then on it joins like any TV, with nothing asked. No on the laptop
 * turns it away, and counts as a wrong key against its address, so a stranger
 * on the Wi-Fi cannot keep the laptop's screen asking.
 *
 * Why the relay picks the digits and not the TV: the four digits are how the
 * person knows the request on the laptop is the TV in front of them. If the
 * asker chose them, a stranger could ask with the same four digits the real
 * TV shows. Two asks at once never share digits.
 *
 * Why a key per TV and not the show key: the show key is what a phone remote
 * holds and what a guest at a gig is shown; a TV at home is the household's.
 * Its own key can be forgotten (Forget paired TVs, in the cast menu) without
 * re-scanning every phone, and a TV key opens only the `tv` role, which only
 * watches. Keys are 128 random bits, so a wrong one is never a guess at the
 * show's eight digits: an unknown TV key is told so (`unpaired`), not counted
 * towards a lockout, and the TV asks to pair again.
 *
 * The file (`CHROMAGLASS_TV_FILE`, the Mac app's `tvs.json` in its user data)
 * also keeps the show's random id, which the Bonjour advert carries so a TV
 * knows this Mac again after its address changes. Never the show key.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';

/** How long an ask waits for the laptop: long enough to walk to it, short enough that a forgotten ask goes. */
export const PAIR_MS = 2 * 60_000;
/** Asks waiting at once, over every address. A home has one or two TVs; more is someone knocking. */
export const PAIR_MAX = 4;
/** A TV's key: `tv-` and 32 hex digits, so it is never mistaken for the show key's eight. */
export const TV_KEY = /^tv-[0-9a-f]{32}$/;

const digest = (s) => createHash('sha256').update(String(s)).digest();

/**
 * The pairing state for one show server. `file` keeps the paired keys and the
 * show id between launches (null: this launch only). Asks are held by the
 * caller's socket objects; this keeps only what it needs to answer the
 * laptop and to let the socket in.
 */
export function createTvPairing({ file = null, now = Date.now } = {}) {
  let store = { id: null, keys: [] };
  try {
    const kept = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof kept?.id === 'string' && /^[0-9a-f]{16}$/.test(kept.id)) store.id = kept.id;
    if (Array.isArray(kept?.keys)) store.keys = kept.keys.filter((k) => typeof k?.key === 'string' && TV_KEY.test(k.key));
  } catch { /* none yet */ }
  const save = () => {
    if (!file) return;
    try {
      writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
      chmodSync(file, 0o600);
    } catch { /* read-only: this launch only */ }
  };
  if (!store.id) { store.id = randomBytes(8).toString('hex'); save(); }

  /** id → { socket, code, address, at } */
  const asks = new Map();
  let seq = 0;

  const freshCode = () => {
    const taken = new Set([...asks.values()].map((a) => a.code));
    for (;;) {
      const c = String(randomInt(0, 10_000)).padStart(4, '0');
      if (!taken.has(c)) return c;
    }
  };

  return {
    /** The show's random id, for the Bonjour advert. */
    showId: () => store.id,
    /** How many TVs hold a key. */
    paired: () => store.keys.length,
    /** Is this a key this show handed a TV? Compared by digest, as the show key is. */
    isTvKey(key) {
      if (typeof key !== 'string' || !TV_KEY.test(key)) return false;
      const d = digest(key);
      return store.keys.some((k) => timingSafeEqual(digest(k.key), d));
    },
    /**
     * A TV asks. Returns `{ id, code }`, or `{ busy: true }` when PAIR_MAX
     * asks already wait. A second ask from the same address replaces its
     * first (a TV reloading), which `replaced` names so the caller can close it.
     */
    ask(socket, address) {
      let replaced = null;
      for (const [id, a] of asks) if (a.address === address) { replaced = a.socket; asks.delete(id); }
      if (asks.size >= PAIR_MAX) return { busy: true, replaced };
      const id = `ask${++seq}`;
      const code = freshCode();
      asks.set(id, { socket, code, address, at: now() });
      return { id, code, replaced };
    },
    /** The asks the laptop is shown, oldest first. */
    list: () => [...asks].map(([id, a]) => ({ id, code: a.code })),
    /** The asks older than PAIR_MS, removed and handed back to be closed. */
    expire() {
      const old = [];
      for (const [id, a] of asks) if (now() - a.at > PAIR_MS) { old.push(a.socket); asks.delete(id); }
      return old;
    },
    /** The laptop said yes: the socket that asked, and its new key (saved). Null if the ask is gone. */
    allow(id) {
      const a = asks.get(id);
      if (!a) return null;
      asks.delete(id);
      const key = `tv-${randomBytes(16).toString('hex')}`;
      store.keys.push({ key, at: new Date(now()).toISOString() });
      save();
      return { socket: a.socket, key };
    },
    /** The laptop said no: the socket and its address, or null. */
    refuse(id) {
      const a = asks.get(id);
      if (!a) return null;
      asks.delete(id);
      return { socket: a.socket, address: a.address };
    },
    /** A socket that asked has gone. True if it was waiting. */
    drop(socket) {
      for (const [id, a] of asks) if (a.socket === socket) { asks.delete(id); return true; }
      return false;
    },
    /** Forget every paired TV: their keys stop working at once. */
    forget() {
      store.keys = [];
      save();
    },
  };
}
