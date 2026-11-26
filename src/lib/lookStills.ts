import { PRESETS, type Preset } from '../presets';
import type { VisualizerSettings } from '../types';

/**
 * The shipped looks and their plate stills (PLAN 34b-1).
 *
 * One list and one path builder shared by all three look pickers:
 * - the desk's Looks grid (`LooksGrid`, `looks-grid-<id>`),
 * - the narrow window's preset menu (`PresetMenu`, `preset-menu-<id>`),
 * - the phone's Looks sheet (`PhoneStage`, `phone-look-<id>`).
 *
 * Every shipped look has a real WebP still of its plate at
 * `public/looks/<id>.webp` (`/looks/<id>.webp`), rendered from the plate
 * shader and sized to 240×150 px under 20 KB. User-saved looks (`Yours`) have
 * no shipped file on disk and return `null` from `lookStill`.
 */

export type LookGroup = 'Light show' | 'Photograph' | 'Closeup' | 'Moiré pack';

export const LOOK_GROUP_ORDER: readonly LookGroup[] = [
  'Light show',
  'Photograph',
  'Closeup',
  'Moiré pack',
];

export interface ShippedLookItem {
  id: string;
  name: string;
  description: string;
  pack?: Preset['pack'];
  group: LookGroup;
  still: string;
  settings: Partial<VisualizerSettings>;
}

const SHIPPED_IDS = new Set<string>(PRESETS.map(p => p.id));

/** Which group of the look pickers a shipped preset belongs to. */
export function lookGroupOf(p: Pick<Preset, 'pack' | 'settings'>): LookGroup {
  if (p.pack === 'moire') return 'Moiré pack';
  if (p.settings.macroMode) return 'Closeup';
  if (p.settings.renderStyle === 'photo') return 'Photograph';
  return 'Light show';
}

/**
 * The URL path to a shipped look's WebP still under `public/looks/<id>.webp`,
 * or `null` when `id` is not a shipped preset (for example a user-saved look).
 */
export function lookStill(id: string | null | undefined): string | null {
  if (!id || !SHIPPED_IDS.has(id)) return null;
  return `/looks/${id}.webp`;
}

/** Every shipped look in `PRESETS`, with its group and its still path. */
export function shippedLooks(): ShippedLookItem[] {
  return PRESETS.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    pack: p.pack,
    group: lookGroupOf(p),
    still: `/looks/${p.id}.webp`,
    settings: p.settings,
  }));
}

/** Shipped looks grouped in display order (`Light show`, `Photograph`, `Closeup`, `Moiré pack`). */
export function groupedShippedLooks(): { label: LookGroup; presets: ShippedLookItem[] }[] {
  const all = shippedLooks();
  return LOOK_GROUP_ORDER
    .map(label => ({ label, presets: all.filter(p => p.group === label) }))
    .filter(g => g.presets.length > 0);
}
