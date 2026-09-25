/**
 * How much each tool does, set per tool.
 *
 * A mouse can only say where and for how long, so every tool had one
 * strength: a drop laid the same dye, a press pressed the same, whoever was
 * holding it. Each tool now has an Amount, 1 being what it always did,
 * kept in this browser because it is the hand's, not the look's.
 */

export const TOOL_AMOUNT = { min: 0.1, max: 3, step: 0.05 } as const;

/** What the amount is, for each tool, in the words its control shows. */
export const TOOL_AMOUNT_MEANS: Record<string, string> = {
  dropper: 'dye laid',
  spray: 'dye in the mist',
  splatter: 'droplets flung',
  pour: 'dye poured',
  streak: 'dye along the stroke',
  blow: 'wind',
  press: 'pressure',
  finger: 'drag',
  magnet: 'pull',
};

const STORE_KEY = 'chromaglass-tool-amounts';

export const clampAmount = (v: number): number =>
  Number.isFinite(v) ? Math.max(TOOL_AMOUNT.min, Math.min(TOOL_AMOUNT.max, v)) : 1;

export function loadToolAmounts(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw ?? {})) if (k in TOOL_AMOUNT_MEANS && typeof v === 'number') out[k] = clampAmount(v);
    return out;
  } catch {
    return {};
  }
}

export function saveToolAmounts(amounts: Record<string, number>): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(amounts)); } catch { /* storage unavailable: kept for this session */ }
}
