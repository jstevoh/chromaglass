/**
 * Which ChromaGlass this page is, by the release's name (PLAN 13-version).
 *
 * A Mac app release is `<major>.<minor>.<run number>` (1.3.692), set by
 * desktop.yml, while the site packed inside it kept `package.json`'s 1.3.0,
 * so the page inside a release called itself something no release is called.
 * desktop.yml now hands the release's version to the site's build as
 * `CHROMAGLASS_VERSION`, and `vite.config.ts` writes it here and into the
 * page's `<meta name="chromaglass-version">`, where `npm run desktop` holds it
 * to the app's own `app.getVersion()`. Any other build (the website, a pull
 * request's app, `npm run show`) is `package.json`'s.
 *
 * Outside a Vite build (the node harnesses) there is no define, and the page
 * is a version nobody shipped.
 */
declare const __APP_VERSION__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
