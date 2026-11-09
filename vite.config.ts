import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin, type Rollup } from 'vite';
import { APP_WORDS } from './src/lib/showPath';

/**
 * The app's chunks, asked for by the page itself rather than by the entry.
 *
 * `main.tsx` imports the app lazily, so the remote and a cast can load
 * without it. That made the show's load a chain: the page, then the entry
 * (207 kB, React and the black box), run, and only then the app's four
 * chunks (about 1.5 MB, 450 kB compressed), a round trip and the entry's
 * whole run later than they could have started. This writes a few lines
 * into the built page that ask for them at once, alongside the entry, unless
 * the address is the remote's or a cast's. `npm run loadtime` measures when
 * the app's chunk starts against when the entry ends.
 *
 * Not at the landing page's address (PLAN.md 14v-9). chromaglass.art shows
 * the webpage first (main.tsx, `landingFirst`), whose own chunk is 4 kB, and
 * the app's preloads there were 590 kB of the 811 kB the page fetched,
 * measured against the live site 2026-10-28: the webpage's chunk was asked
 * only after the entry had arrived and run (1.40 s), and its pictures after
 * that (1.67 s), sharing the line with an app the visitor had not asked for.
 * At that address the page now preloads the webpage's chunk beside the
 * entry, and leaves `window.__cgPreloadApp` for main.tsx to call once the
 * webpage has loaded or Play is pressed. The test is the same one main.tsx
 * makes (lib/showPath.ts), on a build that has a sign-in at all: a build with
 * none (the Mac app's show server, the harnesses) has no webpage.
 */
function preloadApp(signIn: boolean): Plugin {
  let base = '/';
  return {
    name: 'chromaglass-preload-app',
    apply: 'build',
    configResolved(config) { base = config.base; },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const chunks = Object.values(ctx.bundle ?? {}).filter((c): c is Rollup.OutputChunk => c.type === 'chunk');
        const app = chunks.find((c) => c.facadeModuleId?.replace(/\\/g, '/').endsWith('/src/App.tsx'));
        if (!app) throw new Error('preloadApp: no chunk for src/App.tsx');
        const byName = new Map(chunks.map((c) => [c.fileName, c]));
        const walk = (c: Rollup.OutputChunk, files = new Set<string>()) => {
          if (c.isEntry || files.has(c.fileName)) return files;
          files.add(c.fileName);
          for (const i of c.imports) { const d = byName.get(i); if (d) walk(d, files); }
          return files;
        };
        const files = walk(app);
        const list = JSON.stringify([...files].map((f) => `${base}${f}`));
        const landing = chunks.find((c) => c.facadeModuleId?.replace(/\\/g, '/').endsWith('/src/components/Landing.tsx'));
        if (signIn && !landing) throw new Error('preloadApp: no chunk for src/components/Landing.tsx');
        const own = landing ? walk(landing) : new Set<string>();
        /*
          The landing test, as main.tsx's landingFirst() makes it before it
          knows who is signed in: `/` with no app word in its query, not an
          emailed sign-in link coming back, not a sign-in redirect still
          pending. A visitor who must sign in meets the webpage at any other
          address too; there the app is preloaded as before, which costs only
          what it always cost.
        */
        const atLanding = signIn
          ? `const p=location.pathname;let w=(p==='/'||p==='')&&!${JSON.stringify(APP_WORDS)}.some(k=>q.has(k))&&!(q.get('mode')==='signIn'&&q.get('oobCode'));try{if(sessionStorage.getItem('chromaglass-redirect-pending')==='1')w=false}catch{}`
          : 'const w=false;';
        const script = `<script>(()=>{const q=new URLSearchParams(location.search);if(q.has('remote')||q.has('cast'))return;const add=h=>{const l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=h;document.head.appendChild(l)};let done=false;const app=()=>{if(done)return;done=true;for(const h of ${list})add(h)};${atLanding}if(!w)return app();for(const h of ${JSON.stringify([...own].map((f) => `${base}${f}`))})add(h);window.__cgPreloadApp=app})()</script>`;
        // Before the stylesheet: a script after one waits for it to arrive,
        // and the first try, at the end of the head, asked for the chunks
        // only once the CSS was in (0.62 s, after the entry's 0.54 s).
        const at = html.search(/<script type="module"|<link rel="stylesheet"/);
        if (at < 0) throw new Error('preloadApp: no entry script or stylesheet in the page');
        return `${html.slice(0, at)}${script}\n    ${html.slice(at)}`;
      },
    },
  };
}

/**
 * The page's version (lib/appVersion.ts, PLAN 13-version): a Mac app release's
 * own, from desktop.yml's `CHROMAGLASS_VERSION`, or package.json's. Written
 * into the page as a meta tag too, so a check (and a cast, a phone, anything
 * that fetches the page) can read which build it is without running it.
 */
const APP_VERSION = process.env.CHROMAGLASS_VERSION || JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version;
const appVersion = (): Plugin => ({
  name: 'chromaglass-version',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'chromaglass-version', content: APP_VERSION }, injectTo: 'head' }],
});

export default defineConfig(({ mode }) => ({
  // The webpage exists only in a build with a sign-in (main.tsx, LazySignIn).
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [react(), tailwindcss(), appVersion(), preloadApp(Boolean(loadEnv(mode, process.cwd(), 'VITE_').VITE_FIREBASE_API_KEY))],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));
