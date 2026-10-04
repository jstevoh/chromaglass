import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin, type Rollup } from 'vite';

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
 */
function preloadApp(): Plugin {
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
        const files = new Set<string>();
        const walk = (c: Rollup.OutputChunk) => {
          if (c.isEntry || files.has(c.fileName)) return;
          files.add(c.fileName);
          for (const i of c.imports) { const d = byName.get(i); if (d) walk(d); }
        };
        walk(app);
        const list = JSON.stringify([...files].map((f) => `${base}${f}`));
        const script = `<script>(()=>{const q=new URLSearchParams(location.search);if(q.has('remote')||q.has('cast'))return;for(const h of ${list}){const l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=h;document.head.appendChild(l)}})()</script>`;
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

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadApp()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
