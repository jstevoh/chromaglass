/**
 * The engine's own small shapes (PLAN 50c, 19ai-10).
 *
 * `Box<T>` is a React ref's shape without React: `{ current: T }`. While the
 * frame loop is still being carried out of `LiquidVisualizer.tsx` a piece at
 * a time, the component owns the per-frame state in its refs and hands each
 * moved piece the boxes it reads and writes. A `useRef` result is a `Box`, so
 * the component passes its refs as they are and nothing is copied. Nothing in
 * `src/engine/` imports React: that is what will let the engine leave the page
 * thread for a worker (50d) without a rewrite. As pieces move, the boxes they
 * share become fields of one engine state the component no longer holds.
 */
export interface Box<T> { current: T }
