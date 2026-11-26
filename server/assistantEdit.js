/**
 * Set lists and sequences built from the owner's assistant (PLAN 44k-16a):
 * the guard's rules for `assistant-edit`, beside assistant.js because that
 * file is past the 40 KB line `npm run sizes` warns at (as assistantDesk.js
 * is).
 *
 * Asked by name by the owner on 2026-11-12 ("Both": the set list's editing
 * and the sequences'), as part of the goal of 2026-11-09, complete control of
 * ChromaGlass from Claude. Until now `set_list` armed and fired an item and
 * `sequencer` chose and ran a sequence, but nothing built one: adding, taking
 * out and moving a set's items, the set menu's Save and Open, a sequence's
 * stages and its song were the Cues and Sequences panels' alone.
 *
 * What is here is the shape of a call, its ranges and the mode it needs. The
 * names (a look called "Fillmore", the sequence "Slow build", a kept set
 * "Friday") are found on the page (app/editNow.ts), which alone knows them and
 * answers a wrong one with the ones there are, as the desk's names are.
 *
 * The modes. Reading a sequence whole and writing a set's or a sequence's
 * file out change nothing, so they are Suggest: an assistant asked to plan a
 * set reads what there is first. Every edit is Full, because every one
 * changes the owner's saved work (the working set and the kept sets, the
 * sequences, all stored, and the sequences synced to the owner's account),
 * as the desk's layout is Full and for the same reason.
 *
 * Every edit is Undo's to take back: assistant.js remembers each one it lets
 * through and Undo sends `restore`, which the page answers from what it kept
 * before that edit, unless the performer has changed the same thing since
 * (their hand wins, as it does for a setting).
 *
 * Out of range is refused, not clamped: a stage of 5000 seconds the page held
 * to 3600 is a call that did not do what it said.
 */

export const EDIT_OF = ['set', 'sequence'];
export const SET_OPS = ['add', 'remove', 'move', 'name-item', 'link-song', 'unlink-song', 'rename', 'new', 'save', 'open', 'delete-saved', 'import', 'export'];
export const SEQUENCE_OPS = ['read', 'new', 'copy', 'rename', 'loop', 'delete', 'add-stage', 'edit-stage', 'remove-stage', 'move-stage', 'bind-song', 'unbind-song', 'import', 'export'];
/** What changes nothing: Suggest, and not on Undo's list. */
export const EDIT_READS = ['read', 'export'];
/** A stage's own numbers, as the Sequences panel's fields hold them (components/SequencerPanel.tsx). */
export const STAGE_SECONDS = [1, 3600];
export const STAGE_TRANSITION = [0, 300];
export const PALETTE_SIZES = [1, 2, 3];
export const PALETTE_LEAD_MAX = 7;
export const ADVANCES = ['time', 'section', 'hold'];
/** How a stage ends with Pacing up, as the panel's "Ending" offers it. */
export const ENDINGS = ['pacing', 'dark', 'drain', 'lit'];
/** A name of a set, an item, a sequence or a stage. */
export const EDIT_NAME_MAX = 60;
/** A stage's own settings at most: the panel's sliders are fewer. */
export const STAGE_SETTINGS_MAX = 40;
/** A file's text, under the relay's half-megabyte frame once escaped as JSON. */
export const EDIT_TEXT_MAX = 300_000;

const name = (v, max = EDIT_NAME_MAX) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const place = (v) => Number.isInteger(v) && v >= 0;
const within = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** The mode an edit needs: Suggest to read or write a file out, Full for the rest. */
export const editLeast = (op) => (EDIT_READS.includes(op) ? 'suggest' : 'full');
/** Whether Undo can take the call back (assistant.js remembers it). */
export const editChanges = (op) => !EDIT_READS.includes(op);

/** A song named: a title and an artist, or nothing for the song identified now. */
function songOf(v) {
  if (v === undefined) return { ok: {} };
  if (!v || typeof v !== 'object' || !name(v.title, 200) || !name(v.artist, 200)) return { reason: 'song: a title and an artist, or leave it out for the song identified now' };
  return { ok: { song: { title: v.title.trim(), artist: v.artist.trim() } } };
}

/** A stage's fields, only what was named: `{ fields }` or `{ reason }`. */
export function stageFields(f, needSome) {
  if (f === undefined || f === null || typeof f !== 'object' || Array.isArray(f)) return needSome ? { reason: 'stage: name what to change (name, seconds, advance, look, transition, palette_size, palette_lead, macro, ending, settings)' } : { fields: {} };
  const out = {};
  if (f.name !== undefined) { if (!name(f.name)) return { reason: `name: 1 to ${EDIT_NAME_MAX} characters` }; out.name = f.name.trim(); }
  if (f.seconds !== undefined) { if (!within(f.seconds, STAGE_SECONDS)) return { reason: `seconds: from ${STAGE_SECONDS[0]} to ${STAGE_SECONDS[1]}, not ${f.seconds}` }; out.seconds = f.seconds; }
  if (f.advance !== undefined) { if (!ADVANCES.includes(f.advance)) return { reason: `advance: ${ADVANCES.join(', ')}` }; out.advance = f.advance; }
  if (f.transition !== undefined) { if (!within(f.transition, STAGE_TRANSITION)) return { reason: `transition: from ${STAGE_TRANSITION[0]} to ${STAGE_TRANSITION[1]} seconds, not ${f.transition}` }; out.transition = f.transition; }
  if (f.look !== undefined) { if (f.look !== null && !name(f.look, 80)) return { reason: 'look: a look\'s name or id, or null to keep the look that is up' }; out.look = f.look; }
  if (f.paletteSize !== undefined) { if (f.paletteSize !== null && !PALETTE_SIZES.includes(f.paletteSize)) return { reason: `palette_size: ${PALETTE_SIZES.join(', ')} dyes in play, or null for all of them` }; out.paletteSize = f.paletteSize; }
  if (f.paletteLead !== undefined) { if (!Number.isInteger(f.paletteLead) || f.paletteLead < 0 || f.paletteLead > PALETTE_LEAD_MAX) return { reason: `palette_lead: the dye that leads, 0 to ${PALETTE_LEAD_MAX}` }; out.paletteLead = f.paletteLead; }
  if (f.macro !== undefined) { if (f.macro !== null && typeof f.macro !== 'boolean') return { reason: 'macro: true, false, or null for what the look says' }; out.macro = f.macro; }
  if (f.ending !== undefined) { if (!ENDINGS.includes(f.ending)) return { reason: `ending: ${ENDINGS.join(', ')}` }; out.ending = f.ending; }
  if (f.settings !== undefined) {
    const s = f.settings;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return { reason: 'settings: an object of setting keys and numbers (null takes one off the stage)' };
    const keys = Object.keys(s);
    if (keys.length === 0 || keys.length > STAGE_SETTINGS_MAX) return { reason: `settings: 1 to ${STAGE_SETTINGS_MAX} settings` };
    const bad = keys.find((k) => k.length > 60 || !(s[k] === null || (typeof s[k] === 'number' && Number.isFinite(s[k]))));
    if (bad !== undefined) return { reason: `settings: ${bad.slice(0, 60)} is a number, or null to take it off the stage` };
    out.settings = { ...s };
  }
  if (needSome && Object.keys(out).length === 0) return stageFields(undefined, true);
  return { fields: out };
}

/**
 * The guard's call on one `assistant-edit`: `{ out }` for the display, or
 * `{ reason }`. `items` is the set's length as the display last said (null
 * from a display one build older, which then judges a number itself).
 */
export function editGuard(message, items = null) {
  const of = message.of;
  if (!EDIT_OF.includes(of)) return { reason: 'edit: a set or a sequence' };
  const op = message.op;
  const ops = of === 'set' ? SET_OPS : SEQUENCE_OPS;
  if (!ops.includes(op)) return { reason: `${of}: ${ops.join(', ')}` };
  const out = { of, op };
  const n = Number.isInteger(items) ? items : null;
  /** An item by its place (from 0 here, 1 to the assistant), held to the set the display last listed. */
  const item = (k, max = n === null ? Infinity : n - 1) => {
    const v = message[k];
    if (!place(v)) return `${k}: an item by its number, from 1`;
    if (v > max) return n === 0 ? 'the set list is empty' : `${k}: item ${v + 1} of a set of ${n}`;
    out[k] = v;
    return null;
  };
  if (message.text !== undefined || op === 'import') {
    if (op !== 'import') return { reason: 'text: only import takes a file\'s text' };
    if (typeof message.text !== 'string' || !message.text.trim() || message.text.length > EDIT_TEXT_MAX) return { reason: `import: the file's text, up to ${EDIT_TEXT_MAX.toLocaleString('en-US')} characters` };
    out.text = message.text;
  }

  if (of === 'set') {
    if (op === 'add') {
      const look = message.look !== undefined, seq = message.sequence !== undefined;
      if (look === seq) return { reason: 'add: a look (its name or id) or a sequence (its name or id), one of them' };
      const ref = look ? message.look : message.sequence;
      if (!name(ref, 80)) return { reason: `add: the ${look ? 'look' : 'sequence'}'s name or id` };
      out[look ? 'look' : 'sequence'] = ref.trim();
      if (message.at !== undefined) { const why = item('at', n === null ? Infinity : n); if (why) return { reason: why }; }
      if (message.name !== undefined) { if (!name(message.name)) return { reason: `name: 1 to ${EDIT_NAME_MAX} characters` }; out.name = message.name.trim(); }
      return { out };
    }
    if (['remove', 'move', 'name-item', 'link-song', 'unlink-song'].includes(op)) {
      const why = item('item');
      if (why) return { reason: why };
      if (op === 'move') { const w2 = item('to'); if (w2) return { reason: w2 }; if (out.to === out.item) return { reason: 'move: to another place' }; }
      if (op === 'name-item') {
        // An empty name gives the item back its look's own.
        if (typeof message.name !== 'string' || message.name.length > EDIT_NAME_MAX) return { reason: `name: up to ${EDIT_NAME_MAX} characters, or "" for the look's own name` };
        out.name = message.name.trim();
      }
      if (op === 'link-song') { const s = songOf(message.song); if (s.reason) return { reason: s.reason }; Object.assign(out, s.ok); }
      return { out };
    }
    if (op === 'rename' || op === 'open' || op === 'delete-saved') {
      if (!name(message.name)) return { reason: `${op}: ${op === 'rename' ? 'a name' : 'a kept set\'s name'}, 1 to ${EDIT_NAME_MAX} characters` };
      out.name = message.name.trim();
      return { out };
    }
    if (op === 'new' || op === 'save') {
      if (message.name !== undefined) { if (!name(message.name)) return { reason: `name: 1 to ${EDIT_NAME_MAX} characters` }; out.name = message.name.trim(); }
      return { out };
    }
    return { out };
  }

  // A sequence: by name or id, or the one chosen (show_state's sequencer.selectedId).
  if (message.sequence !== undefined) {
    if (!name(message.sequence, 80)) return { reason: 'sequence: its name or id, as show_state\'s sequencer.sequences lists them' };
    out.sequence = message.sequence.trim();
  } else if (op === 'delete') return { reason: 'delete: name the sequence to delete' };
  const stageAt = (k) => { const v = message[k]; if (!place(v) || v > 200) return `${k}: a stage by its number, from 1`; out[k] = v; return null; };
  if (op === 'new' || op === 'copy') {
    if (message.name !== undefined) { if (!name(message.name)) return { reason: `name: 1 to ${EDIT_NAME_MAX} characters` }; out.name = message.name.trim(); }
  }
  if (op === 'rename') { if (!name(message.name)) return { reason: `rename: a name of 1 to ${EDIT_NAME_MAX} characters` }; out.name = message.name.trim(); }
  if (op === 'loop') { if (typeof message.on !== 'boolean') return { reason: 'loop: on true or false' }; out.on = message.on; }
  if (op === 'add-stage') {
    if (message.at !== undefined) { const why = stageAt('at'); if (why) return { reason: why }; }
    const f = stageFields(message.fields, false);
    if (f.reason) return { reason: f.reason };
    out.fields = f.fields;
  }
  if (op === 'edit-stage' || op === 'remove-stage' || op === 'move-stage') {
    const why = stageAt('index');
    if (why) return { reason: why };
    if (op === 'move-stage') { const w2 = stageAt('to'); if (w2) return { reason: w2 }; if (out.to === out.index) return { reason: 'move_stage: to another place' }; }
    if (op === 'edit-stage') { const f = stageFields(message.fields, true); if (f.reason) return { reason: f.reason }; out.fields = f.fields; }
  }
  if (op === 'bind-song') { const s = songOf(message.song); if (s.reason) return { reason: s.reason }; Object.assign(out, s.ok); }
  return { out };
}
