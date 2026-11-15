/**
 * The desk from the owner's assistant (PLAN 44k-16, 44k-17): the guard's
 * rules for `assistant-desk`, beside assistant.js because that file is past
 * the 40 KB line `npm run sizes` warns at (as assistantProjector.js is).
 *
 * Asked as part of the owner's goal of 2026-11-09, complete control of
 * ChromaGlass from Claude, with the desk's layout added on the owner's word
 * of 2026-11-11. What is here is the shape of a call and the mode it needs;
 * the names (a tab called "Gig", the panel "Rides", the palette "Cool Ocean")
 * are found on the page (app/deskNow.ts), which alone knows them and answers
 * a wrong one with the ones there are.
 *
 * The modes, by what a call changes:
 *
 *  - Play: `tab` (which tab is up: the person's screen changes, the plate
 *    does not) and `hand` (the palette lock, the tool and its amount, the
 *    plate a gesture lands on). These are what the bench's bottle is: what
 *    the next pour does, or which colours the music may pick.
 *  - Full: everything that changes the owner's saved desk: `tabs` (rename,
 *    move, add, delete, reset every tab), `panel` (dock, float, open, close,
 *    fold a panel, fold them all, fold the deck, a tab's plate mode),
 *    `pin` (a setting on the rides or the recipe) and `view` (the MIDI
 *    activity overlay, Ambient TV mode). The tabs travel to the owner's
 *    account, so these reach the owner's other machines too.
 *
 * A delete and a reset of every tab are the two edits that take something
 * away, and both are Undo's to put back: assistant.js remembers them, and
 * its Undo sends `tab-restore`, which the page answers from the one it kept.
 *
 * Out of range is refused, not clamped, as the wall's numbers are: an amount
 * the page would quietly hold to 5 is a call that did not do what it said.
 */

export const DESK_DOES = ['tab', 'hand', 'tabs', 'panel', 'pin', 'view'];
const PLAY_DOES = new Set(['tab', 'hand']);
export const TAB_OPS = ['rename', 'move', 'add', 'delete', 'reset-all'];
export const PANEL_VERBS = ['dock', 'float', 'open', 'close', 'fold', 'unfold', 'fold-all', 'unfold-all', 'deck-fold', 'deck-unfold', 'plate'];
const NO_PANEL = new Set(['fold-all', 'unfold-all', 'deck-fold', 'deck-unfold', 'plate']);
export const DESK_SLOTS = ['left', 'right', 'deck'];
export const DESK_SURFACES = ['perform', 'design'];
/** The tools, as lib/toolAmount.ts's TOOL_AMOUNT_MEANS lists them (`npm run assistant` holds the two equal). */
export const DESK_TOOLS = ['dropper', 'spray', 'splatter', 'pour', 'streak', 'blow', 'press', 'finger', 'magnet', 'spin'];
/** An Amount's range, as TOOL_AMOUNT's (lib/toolAmount.ts). */
export const AMOUNT_RANGE = [0.05, 5];
/** A tab's name, as TAB_NAME_MAX (lib/deskTabs.ts); a move, at most the strip's length. */
export const NAME_MAX = 24;
export const MOVE_MAX = 8;

const name = (v, max = 40) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** The mode a desk call needs: Play for the tab up and the hand, Full for the rest. */
export const deskLeast = (d) => (PLAY_DOES.has(d) ? 'play' : 'full');

/** The guard's call on one `assistant-desk`: `{ out }` for the display, or `{ reason }`. */
export function deskGuard(message) {
  const d = message.do;
  if (!DESK_DOES.includes(d)) return { reason: `desk: ${DESK_DOES.join(', ')}` };
  if (d === 'tab') return name(message.tab) ? { out: { do: d, tab: message.tab } } : { reason: 'tab: a tab\'s name or id' };
  if (d === 'tabs') {
    const op = message.op;
    if (!TAB_OPS.includes(op)) return { reason: `tabs: ${TAB_OPS.join(', ')}` };
    if (op === 'reset-all') return { out: { do: d, op } };
    if (op === 'add') {
      if (message.copyOf !== undefined && !name(message.copyOf)) return { reason: 'add: copy_of is a tab\'s name or id' };
      return { out: { do: d, op, ...(message.copyOf === undefined ? {} : { copyOf: message.copyOf }) } };
    }
    if (!name(message.tab)) return { reason: `${op}: a tab's name or id` };
    if (op === 'rename') return name(message.name, NAME_MAX) ? { out: { do: d, op, tab: message.tab, name: message.name.trim() } } : { reason: `rename: a name of 1 to ${NAME_MAX} characters` };
    if (op === 'move') {
      return Number.isInteger(message.by) && message.by !== 0 && Math.abs(message.by) <= MOVE_MAX
        ? { out: { do: d, op, tab: message.tab, by: message.by } } : { reason: `move: by a whole number of places, -${MOVE_MAX} to ${MOVE_MAX}, not 0` };
    }
    return { out: { do: d, op, tab: message.tab } };
  }
  if (d === 'panel') {
    const verb = message.verb;
    if (!PANEL_VERBS.includes(verb)) return { reason: `panel: ${PANEL_VERBS.join(', ')}` };
    if (message.tab !== undefined && !name(message.tab)) return { reason: 'panel: tab is a tab\'s name or id' };
    if (!NO_PANEL.has(verb) && !name(message.panel)) return { reason: `${verb}: a panel's name or id` };
    if (verb === 'dock' && !DESK_SLOTS.includes(message.slot)) return { reason: `dock: a slot (${DESK_SLOTS.join(', ')})` };
    if (verb === 'open' && message.slot !== undefined && ![...DESK_SLOTS, 'float'].includes(message.slot)) return { reason: `open: ${DESK_SLOTS.join(', ')} or float` };
    if (verb === 'plate' && !['live', 'preview'].includes(message.plate)) return { reason: 'plate: live or preview' };
    if (message.index !== undefined && !(Number.isInteger(message.index) && message.index >= 0 && message.index <= 40)) return { reason: 'index: a place in the slot, from 0' };
    const out = { do: d, verb };
    for (const k of ['tab', 'panel', 'slot', 'index', 'plate']) if (message[k] !== undefined) out[k] = message[k];
    return { out };
  }
  if (d === 'pin') {
    if (!DESK_SURFACES.includes(message.surface)) return { reason: 'pin: the rides (perform) or the recipe (design)' };
    if (!name(message.key, 60) || typeof message.on !== 'boolean') return { reason: 'pin: a setting\'s key, and on true or false' };
    return { out: { do: d, surface: message.surface, key: message.key, on: message.on } };
  }
  if (d === 'view') {
    const v = message.view ?? {};
    const view = {};
    for (const k of ['activity', 'ambient']) if (typeof v[k] === 'boolean') view[k] = v[k];
    return Object.keys(view).length ? { out: { do: d, view } } : { reason: 'view: midi_activity or ambient_tv, true or false' };
  }
  // The hand: only what is named.
  const h = message.hand ?? {};
  const hand = {};
  if (h.palette !== undefined) {
    if (h.palette !== null && !name(h.palette)) return { reason: 'palette: a palette\'s name, or null to let the colours roam' };
    hand.palette = h.palette;
  }
  if (h.tool !== undefined) {
    if (!DESK_TOOLS.includes(h.tool)) return { reason: `tool: ${DESK_TOOLS.join(', ')}` };
    hand.tool = h.tool;
  }
  if (h.amount !== undefined) {
    const [lo, hi] = AMOUNT_RANGE;
    if (typeof h.amount !== 'number' || !Number.isFinite(h.amount) || h.amount < lo || h.amount > hi) return { reason: `amount: from ${lo} to ${hi} (1 is what the tool always did), not ${h.amount}` };
    hand.amount = h.amount;
  }
  if (h.layer !== undefined) {
    if (!Number.isInteger(h.layer) || h.layer < 0 || h.layer > 1) return { reason: 'layer: 0 or 1, the plate a gesture lands on' };
    hand.layer = h.layer;
  }
  return Object.keys(hand).length ? { out: { do: d, hand } } : { reason: 'hand: name a palette, a tool, an amount or a layer' };
}
