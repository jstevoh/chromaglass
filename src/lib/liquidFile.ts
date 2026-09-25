/**
 * Liquids anyone can make: the file they are kept in, and what one does when
 * it meets another.
 *
 * A liquid here is what the plate can actually do with it. The solver has no
 * list of pairs to consult when two liquids meet; each cell carries what kind
 * of liquid is there (weight, polarity) and how much of each property has
 * landed (soap, body, repel, acid, the ferrofluid), and the forces follow from
 * those (`lib/liquidPhase.ts`). So a liquid is designed by its properties, and
 * how it meets every other liquid on the shelf follows from them, the same way
 * oil and water follow from oil being oil. `meets` says what that will be, in
 * words, from the same rules the plate uses.
 *
 * The file, `*.liquids.json`:
 *
 *   {
 *     "format": "chromaglass.liquids",
 *     "version": 1,
 *     "liquids": [
 *       {
 *         "name": "Mercury Silk",
 *         "color": "#c8d0e0",
 *         "description": "Heavy and slick: sinks, and will not mix",
 *         "drop": { "size": 3, "amount": 1.2, "heat": 0 },
 *         "behaviour": { "weight": 0.4, "polarity": -0.7, "repel": 0.5 }
 *       }
 *     ]
 *   }
 *
 * Every field but `name` may be left out, and a number out of range is held to
 * the range rather than refused. A single liquid on its own, or a bare array of
 * them, is read too, so a file written by hand does not need the wrapper.
 * docs/liquid-format.md says what each property does.
 */

import type { LiquidBehaviour, LiquidType } from '../types';

export const LIQUID_FORMAT = 'chromaglass.liquids';
export const LIQUID_FORMAT_VERSION = 1;

/** One property of a liquid: its range, its resting value, and what it does, for the designer and the checks. */
export interface LiquidProperty {
  key: keyof LiquidBehaviour;
  label: string;
  min: number;
  max: number;
  step: number;
  /** What moving it does, in a line. */
  hint: string;
}

export const BEHAVIOUR_PROPERTIES: LiquidProperty[] = [
  { key: 'weight', label: 'Weight', min: -0.5, max: 0.5, step: 0.01,
    hint: 'Heavier than water (+) settles downhill when the plate is tilted; lighter (−) rides up over it.' },
  { key: 'polarity', label: 'Polarity', min: -1, max: 1, step: 0.05,
    hint: 'Like mixes with like: liquids close on this scale blend, far apart they hold an edge. Water is 0, oil −0.9.' },
  { key: 'soap', label: 'Soap', min: 0, max: 1, step: 0.05,
    hint: 'Breaks the surface: colour runs away from it and curls into filaments.' },
  { key: 'body', label: 'Body', min: 0, max: 1, step: 0.05,
    hint: 'Thicker than water: it crawls where it lies while the plate flows past.' },
  { key: 'repel', label: 'Repel', min: 0, max: 1, step: 0.05,
    hint: 'A pool of it keeps its own edge against whatever it meets.' },
  { key: 'acid', label: 'Acid / Base', min: -1, max: 1, step: 0.05,
    hint: 'Acid (+) turns a pH indicator in the dye pink, base (−) green; they cancel where they meet.' },
  { key: 'magnetic', label: 'Magnetic', min: 0, max: 1, step: 0.05,
    hint: 'Ferrofluid: pours into the dark liquid a magnet pulls, which does not mix with the dye.' },
];

export const DROP_RANGES = {
  size: { min: 1, max: 8, step: 0.5, hint: 'How wide each drop spreads, in cells.' },
  amount: { min: 0, max: 3, step: 0.05, hint: 'How much colour each drop lays while held.' },
  heat: { min: 0, max: 1, step: 0.05, hint: 'How warm it lands: warm liquid rises where the plate has buoyancy.' },
} as const;

/** What a liquid is written as in the file. */
export interface LiquidSpec {
  id?: string;
  name: string;
  color?: string;
  description?: string;
  drop?: { size?: number; amount?: number; heat?: number };
  behaviour?: Partial<Record<keyof LiquidBehaviour, number>>;
}

export interface LiquidFile {
  format: typeof LIQUID_FORMAT;
  version: number;
  liquids: LiquidSpec[];
}

/** A liquid someone made, as distinct from the shelf the app ships. */
export const CUSTOM_PREFIX = 'custom-';
export const isCustomLiquid = (l: { id: string }): boolean => l.id.startsWith(CUSTOM_PREFIX);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function slug(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'liquid';
}

/** `#rgb` or `#rrggbb`, as `#rrggbb`; anything else is null. */
export function normaliseColour(c: unknown): string | null {
  if (typeof c !== 'string') return null;
  const s = c.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map((h) => h + h).join('');
  return null;
}

/** An id for `name` that none of `taken` has. */
export function freshId(name: string, taken: Set<string>): string {
  const base = CUSTOM_PREFIX + slug(name);
  let id = base;
  for (let k = 2; taken.has(id); k++) id = `${base}-${k}`;
  return id;
}

/** The behaviour a spec asks for, held to range; undefined when it asks for none (a plain dye). */
function readBehaviour(raw: unknown, where: string, warnings: string[]): LiquidBehaviour | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) { warnings.push(`${where}: "behaviour" is not an object, left out`); return undefined; }
  const out: LiquidBehaviour = {};
  const known = new Set(BEHAVIOUR_PROPERTIES.map((p) => p.key as string));
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(k)) { warnings.push(`${where}: "${k}" is not a property a liquid has, ignored`); continue; }
    const p = BEHAVIOUR_PROPERTIES.find((q) => q.key === k)!;
    const n = num(v);
    if (n === undefined) { warnings.push(`${where}: ${p.label} is not a number, ignored`); continue; }
    const c = clamp(n, p.min, p.max);
    if (c !== n) warnings.push(`${where}: ${p.label} ${n} is outside ${p.min} to ${p.max}, held to ${c}`);
    if (c !== 0) out[p.key] = c;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * A spec as a liquid on the shelf. `taken` is every id already there; the new
 * id is added to it. Throws with a message a person can act on if the spec has
 * no name.
 */
export function specToLiquid(raw: unknown, where: string, taken: Set<string>, warnings: string[]): LiquidType {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${where} is not a liquid (an object with a "name")`);
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : '';
  if (!name) throw new Error(`${where} has no "name"`);
  const colour = normaliseColour(r.color ?? r.colour);
  if ((r.color ?? r.colour) !== undefined && !colour) warnings.push(`${name}: colour "${String(r.color ?? r.colour)}" is not #rrggbb, using grey`);
  const drop = (r.drop && typeof r.drop === 'object' ? r.drop : {}) as Record<string, unknown>;
  const held = (key: keyof typeof DROP_RANGES, fallback: number) => {
    const n = num(drop[key]);
    if (n === undefined) return fallback;
    const { min, max } = DROP_RANGES[key];
    const c = clamp(n, min, max);
    if (c !== n) warnings.push(`${name}: drop ${key} ${n} is outside ${min} to ${max}, held to ${c}`);
    return c;
  };
  // An id the file asks for is kept when it is free and names a custom liquid,
  // so the same file imported twice replaces rather than duplicates — the
  // caller decides that; here it only has to be free.
  const asked = typeof r.id === 'string' && r.id.startsWith(CUSTOM_PREFIX) ? r.id : null;
  const id = asked && !taken.has(asked) ? asked : freshId(name, taken);
  taken.add(id);
  const description = typeof r.description === 'string' ? r.description.trim().slice(0, 200) : '';
  return {
    id,
    name,
    color: colour ?? '#9aa0a8',
    description,
    injectRadius: held('size', 3),
    injectAmount: held('amount', 0.8),
    heatAmount: held('heat', 0),
    behaviour: readBehaviour(r.behaviour, name, warnings),
  };
}

export interface ReadResult { liquids: LiquidType[]; warnings: string[] }

/**
 * Read a liquids file. `taken` is every id on the shelf, built-in and custom;
 * a liquid whose id is a custom one already there is given back with that id
 * (`replaces`), so importing an edited file updates what it made before.
 */
export function readLiquidFile(text: string, shelf: LiquidType[]): ReadResult & { replaces: string[] } {
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`not JSON: ${(e as Error).message}`); }
  const warnings: string[] = [];
  let list: unknown[];
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object' && Array.isArray((data as { liquids?: unknown }).liquids)) {
    const f = data as { format?: unknown; version?: unknown; liquids: unknown[] };
    if (f.format !== undefined && f.format !== LIQUID_FORMAT) warnings.push(`format "${String(f.format)}" is not "${LIQUID_FORMAT}", read anyway`);
    if (typeof f.version === 'number' && f.version > LIQUID_FORMAT_VERSION) warnings.push(`written for version ${f.version} of the format; this app reads ${LIQUID_FORMAT_VERSION}, and anything newer is left out`);
    list = f.liquids;
  } else if (data && typeof data === 'object' && 'name' in (data as object)) list = [data];
  else throw new Error('no liquids in it: expected {"format": "chromaglass.liquids", "liquids": [...]}');
  if (list.length === 0) throw new Error('the file has no liquids in it');
  if (list.length > 64) throw new Error(`${list.length} liquids is more than a shelf holds (64)`);

  const builtIn = new Set(shelf.filter((l) => !isCustomLiquid(l)).map((l) => l.id));
  const custom = new Set(shelf.filter(isCustomLiquid).map((l) => l.id));
  // Ids handed out so far: the built-ins, then each liquid this file makes.
  // A liquid naming a custom id already on the shelf keeps it (and replaces
  // that liquid); any other gets an id no liquid on the shelf has.
  const taken = new Set(builtIn);
  const replaces: string[] = [];
  const liquids = list.map((raw, i) => {
    const r = raw as Record<string, unknown> | null;
    const asked = r && typeof r.id === 'string' && custom.has(r.id) && !taken.has(r.id) ? r.id : null;
    const avoid = asked ? new Set(taken) : new Set([...taken, ...custom]);
    const l = specToLiquid(raw, `liquid ${i + 1}`, avoid, warnings);
    taken.add(l.id);
    if (asked && l.id === asked) replaces.push(asked);
    return l;
  });
  return { liquids, warnings, replaces };
}

/** A liquid as it is written in the file. */
export function liquidToSpec(l: LiquidType): LiquidSpec {
  const spec: LiquidSpec = { id: l.id, name: l.name, color: l.color };
  if (l.description) spec.description = l.description;
  spec.drop = { size: l.injectRadius, amount: l.injectAmount, heat: l.heatAmount };
  const b: Record<string, number> = {};
  for (const p of BEHAVIOUR_PROPERTIES) { const v = l.behaviour?.[p.key]; if (v) b[p.key] = v; }
  if (Object.keys(b).length) spec.behaviour = b;
  return spec;
}

export function writeLiquidFile(liquids: LiquidType[]): string {
  const file: LiquidFile = { format: LIQUID_FORMAT, version: LIQUID_FORMAT_VERSION, liquids: liquids.map(liquidToSpec) };
  return JSON.stringify(file, null, 2) + '\n';
}

/*
  How one liquid meets another, in words, from the rules the plate uses.

  Polarity is continuous in the solver — liquids are pushed apart in
  proportion to how far apart their polarities are (UNMIX in liquidPhase.ts) —
  so the words are bands of one number rather than a switch. Weight only acts
  with the plate tilted (Gravity), because a level dish does not separate by
  moving sideways. Oil below −0.5 polarity is also poured into the oil the
  surface tension rounds into drops, on a look with Oil Tension up.
*/
export interface Meeting { mixing: 'blends' | 'soft edge' | 'stays apart'; notes: string[] }

export function meets(a: LiquidType, b: LiquidType): Meeting {
  const pa = a.behaviour?.polarity ?? 0, pb = b.behaviour?.polarity ?? 0;
  const gap = Math.abs(pa - pb) + Math.max(a.behaviour?.repel ?? 0, b.behaviour?.repel ?? 0) * 0.4;
  const mixing: Meeting['mixing'] = gap < 0.3 ? 'blends' : gap < 0.7 ? 'soft edge' : 'stays apart';
  const notes: string[] = [];
  const wa = a.behaviour?.weight ?? 0, wb = b.behaviour?.weight ?? 0;
  if (wa - wb > 0.05) notes.push('sinks under it on a tilted plate');
  else if (wb - wa > 0.05) notes.push('rides over it on a tilted plate');
  if (pa < -0.5 && pb > -0.5 && !(a.behaviour?.magnetic ?? 0)) notes.push('beads into drops in it with Oil Tension up');
  const aa = a.behaviour?.acid ?? 0, ab = b.behaviour?.acid ?? 0;
  if (aa * ab < 0) notes.push('they neutralise each other');
  if ((a.behaviour?.soap ?? 0) > 0.2) notes.push('chases its colour away');
  if ((b.behaviour?.soap ?? 0) > 0.2) notes.push('is chased away by it');
  if ((a.behaviour?.magnetic ?? 0) > 0 && !(b.behaviour?.magnetic ?? 0)) notes.push('never mixes with its dye; a magnet pulls it through');
  if ((a.behaviour?.body ?? 0) - (b.behaviour?.body ?? 0) > 0.3) notes.push('crawls while it flows past');
  return { mixing, notes };
}

/*
  The shelf someone has made, kept in this browser.

  Storage can be missing or throw (a private window, blocked site data), so
  every read and write is guarded and the app runs with the built-in shelf
  alone when it does.
*/
const STORE_KEY = 'chromaglass-custom-liquids';

export function loadCustomLiquids(): LiquidType[] {
  try {
    const text = localStorage.getItem(STORE_KEY);
    if (!text) return [];
    const taken = new Set<string>();
    const warnings: string[] = [];
    const list = JSON.parse(text) as unknown[];
    if (!Array.isArray(list)) return [];
    const out: LiquidType[] = [];
    for (const [i, raw] of list.entries()) {
      try { out.push(specToLiquid(raw, `stored liquid ${i + 1}`, taken, warnings)); } catch { /* one bad entry loses only itself */ }
    }
    return out.filter(isCustomLiquid);
  } catch {
    return [];
  }
}

export function saveCustomLiquids(liquids: LiquidType[]): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(liquids.filter(isCustomLiquid).map(liquidToSpec))); } catch { /* storage unavailable: kept for this session */ }
}
