import { OPEN_RIM } from './turntable';

/*
  Which cells of an n×n grid lie inside the dish's open rim (r < OPEN_RIM,
  from the cell's centre), one byte a cell, worked out once a grid size
  (PLAN 14ab-3, 14ab-9).

  The solver's means, the thick liquid's share and the app's mirror each
  tested every cell against the rim every time they ran, two of them with a
  square root a cell, at up to sixty times a second. Kept apart, they also
  wrote the test two ways (`Math.hypot(u, v) < R` and `u² + v² < R²`), which
  is the same set of cells on any grid: a cell's centre sits at an odd number
  of half cells from the middle, so (2i + 1 − n)² + (2j + 1 − n)², the sum of
  two odd squares, is never n², and the nearest cell is a whole 2/n² of the
  rim's radius squared away, far past what rounding can move.
*/
const masks = new Map<number, { mask: Uint8Array; count: number }>();

function rim(n: number): { mask: Uint8Array; count: number } {
  let got = masks.get(n);
  if (!got) {
    const mask = new Uint8Array(n * n);
    let count = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (Math.hypot((i + 0.5) / n - 0.5, (j + 0.5) / n - 0.5) < OPEN_RIM) { mask[i + j * n] = 1; count++; }
      }
    }
    got = { mask, count };
    masks.set(n, got);
  }
  return got;
}

/** The cells inside the rim: 1 inside, 0 outside, row by row. */
export function rimMask(n: number): Uint8Array { return rim(n).mask; }

/** How many cells lie inside the rim. */
export function rimCount(n: number): number { return rim(n).count; }
