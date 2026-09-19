/**
 * The wordmark and the mark, as URLs (drawn by `npm run brand`).
 *
 * `new URL(…, import.meta.url)` rather than an `import`. Vite treats the two
 * the same — the file is hashed into `/assets/`, where the service worker keeps
 * it for a show with no network — but the harnesses bundle components with
 * esbuild, which has no loader for SVG and fails the whole bundle on an import
 * of one, while it leaves this expression alone.
 */
export const LOCKUP_URL = new URL('./assets/brand/lockup.svg', import.meta.url).href;
export const MARK_URL = new URL('./assets/brand/mark.svg', import.meta.url).href;
