# Mac verification report — 2026-09-13

Run on James's Mac (`~/chromaglass`, Darwin 25.5.0) from a scheduled task relayed by chromaglass-69.

## Summary

| Step | Result |
|---|---|
| 1. Update checkout | OK — fast-forward d34cd03 → fe4ea28, `npm install` and `npm run build` clean |
| 2. Firebase deploy | **OK** — "Deploy complete!", no sign-in needed |
| 3. Show server | OK — running in the background (pid 83680), key given to James in the Mac session (redacted here), LAN host 192.168.0.234 |
| 4. Live site check | **Match** — `assets/index-DqZlrub0.js` both live and in `dist/` |
| 5. Engine measurement | OK — GPU engine, strong GPU, local tier, ~17 ms frames (classic ~20 ms). Playwright was not in the repo's node_modules; installed into a scratch dir instead (see below) |

## 1. Update the checkout

Working tree before the pull:

```
 M package-lock.json
?? chromaglass/
```

- `package-lock.json`: 531 deleted lines, all `optional`/`peer` platform entries for `@esbuild/*` (aix-ppc64, android-arm, …) — what `npm install` rewrites on this Mac. Generated; left as is and **not committed**.
- `chromaglass/`: **not generated** — an untracked nested full clone of the repo (140 MB, its own `.git`, at commit `59bd3f1 Remove the Monochrome Ink preset`, files dated Sep 9). Left untouched. It does not collide with any path on main, so it did not block the pull. Someone should decide whether it is still wanted.

Neither blocked the pull, so no stash was needed.

```
$ git pull origin main
Updating d34cd03..fe4ea28
Fast-forward
 CHANGELOG.md                     |  6 ++++
 src/App.tsx                      |  4 +++
 src/components/PresetMenu.tsx    |  2 +-
 src/components/SettingsPanel.tsx | 72 ++++++++++++++++++++++++++++++++++++++--
 4 files changed, 81 insertions(+), 3 deletions(-)
$ git log --oneline -1
fe4ea28 Readable toolbar preset menu, and Save/Load presets from Settings too (#15)
```

`npm install`: finished; reports `7 vulnerabilities (1 low, 1 moderate, 5 high)` (npm audit, not acted on). The working tree afterwards was the same as before (`M package-lock.json`, `?? chromaglass/`).

```
$ npm run build
✓ 2116 modules transformed.
dist/index.html                          1.26 kB │ gzip:  0.56 kB
dist/assets/songMapWorker-Dc5_FQYD.js    5.77 kB
dist/assets/index-Cfg05uSr.css          43.00 kB │ gzip:  7.59 kB
dist/assets/useRemoteLink-DskDInyp.js    2.33 kB │ gzip:  1.08 kB
dist/assets/CastDisplay-DeT7rD5u.js      6.07 kB │ gzip:  2.33 kB
dist/assets/RemoteControl-HuR-SBlG.js   16.85 kB │ gzip:  5.05 kB
dist/assets/presets-DtcnboDW.js         27.51 kB │ gzip:  6.60 kB
dist/assets/castProtocol-C-HcROL3.js   168.46 kB │ gzip: 54.82 kB
dist/assets/index-DqZlrub0.js          196.38 kB │ gzip: 61.66 kB
dist/assets/App-CapJ0KeO.js            297.18 kB │ gzip: 89.34 kB
✓ built in 1.01s
```

## 2. Deploy

```
$ npm run deploy
> npx firebase-tools deploy --only hosting
=== Deploying to 'chromaglass'...
i  hosting[chromaglass]: found 13 files in dist
✔  hosting[chromaglass]: file upload complete
✔  hosting[chromaglass]: version finalized
✔  hosting[chromaglass]: release complete
✔  Deploy complete!
Project Console: https://console.firebase.google.com/project/chromaglass/overview
Hosting URL: https://chromaglass.web.app
```

No Google sign-in prompt; the Mac's Firebase CLI was already authenticated.

## 3. Show server

`lsof -nP -iTCP:3000 -sTCP:LISTEN` before the restart: **nothing was listening** on port 3000, so there was no process to stop. Started with `(nohup npm run remote > ~/chromaglass-server.log 2>&1 &)`.

```
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
node    83680 jameshiggins   12u  IPv4 ...  TCP *:3000 (LISTEN)
$ curl -s http://127.0.0.1:3000/remote-info.json
{"chromaglass":"relay","path":"/remote-ws","port":3000,"hosts":["192.168.0.234"],"key":"<key>"}
$ tail -20 ~/chromaglass-server.log
  ChromaGlass show server

  Show key:           <key>
  Laptop (the show):  http://localhost:3000/
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=<key>
  Network display:    http://192.168.0.234:3000/?cast=true&key=<key>

  Same Wi-Fi: use the addresses above. Across buildings, other access points
  or the internet: run "npm run tunnel" in another window and use the https
  address it prints, with ?cast=true&key=<key> or ?remote=1&key=<key>.
```

The key is random per start (no `SHOW_KEY` set), so it changes if the server restarts.

## 4. Live site

```
$ curl -s https://chromaglass.web.app/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
assets/index-DqZlrub0.js
$ grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html
assets/index-DqZlrub0.js
```

Match.

## 5. Engine measurement

**Deviation:** `npx playwright` is *not* available in the repo — there is no `playwright` or `@playwright/test` in `node_modules`, and `npx --no-install playwright` fails with "missing packages: playwright@1.63.0". Rather than change the repo's dependencies, Playwright was installed into a throwaway scratch directory (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install playwright`) and launched the installed Google Chrome with `channel: 'chrome', headless: false`. Viewport 1280×800, Playwright's default `deviceScaleFactor` of 1 — so **dpr 1.0 reflects the test window, not the governor's choice**; a real Retina window would offer 2x.

Procedure as specified: open `http://localhost:3000/?debug`, wait 12 s, read `window.chromaglassDebug().status`; then for each preset click `[data-testid="preset-title-button"]`, click `[data-testid="preset-menu-<id>"]`, wait 25 s, read status, screenshot. No audio input was running (no mic permission granted), so the show was driven only by the presets' own seeding.

| Moment | label | engine | grid | dpr | tier | gpu | frameMs | governed | steppedDown |
|---|---|---|---|---|---|---|---|---|---|
| Initial (12 s) | GPU · 512² · 1.0x | gpu | 512 | 1 | local | strong | 16.84 | true | false |
| Oil on Water (+25 s) | GPU · 768² · 1.0x | gpu | 768 | 1 | local | strong | 16.91 | true | false |
| Classic (+25 s) | GPU · 512² · 1.0x | gpu | 512 | 1 | local | strong | 20.15 | true | false |
| Colorful Cosmos (+25 s) | GPU · 512² · 1.0x | gpu | 512 | 1 | local | strong | 16.96 | true | false |

`gpuUnavailable` was false throughout. The governor climbed to 768² during Oil on Water, then was back at 512² for Classic (frames ~20 ms, ≈50 fps — below 60) and stayed at 512² for Colorful Cosmos. `steppedDown` stayed false, so the drop from 768² either happened as part of a preset change or the flag doesn't cover that move — worth a look.

Raw status for every step, and all console warnings, are in `reports/engine-status.json`.

### Screenshots

- `reports/initial.png` — the page after 12 s, before choosing a preset.
- `reports/oil-on-water.png` — **Yes, it reads as oil over blue paper.** Yellow and amber oil over a pale blue ground; a blue-green pool edged in bright green, with a clear bubble lens in it that shows a highlight; loose yellow droplets, a scatter of tiny satellite droplets across the frame, and strong shallow focus that blurs the lower-left foreground and the edges. Nothing obviously broken. The defocus is heavy — nearly the whole frame is soft, with only the pool's rim sharp — and there's a muddy brown patch under the pool.
- `reports/classic.png` — The dark projected light-show look: deep violet/indigo plate with magenta, red and a pale pink wash, and two bright yellow streaks at the top, fine grain specks. Bubbles are glossy lenses, but several have thin **loop outlines that come off the bubble** (open rings next to the lens) — reads more like an artifact than a meniscus. Not broken, but worth checking. It's also the slowest preset measured (20 ms).
- `reports/colorful-cosmos.png` — A big red drop in soft focus over a pale yellow-to-teal gradient, with magenta drops, blue/indigo drops lower right, and a bright lamp point in the drop's centre; photographic depth of field. **One obvious oddity:** a tight cluster of small pink-and-orange hexagonal cells with white dots in them, at the drop's upper-left edge, sharp while everything around it is soft. It looks like a stamped overlay (macro paint-cell texture or droplet sprites?) rather than part of the photograph. A few cyan droplets lower right look squarish too.

### Console

266 warnings and no page errors:

- 256 × `performance warning: READ-usage buffer was written, then fenced, but written again before being read back. This discarded the shadow copy that was created to accelerate readback.` — the PBO readback path is overwriting buffers before they are read back (see "The GPU path no longer stalls every frame" in the CHANGELOG), so the async readback probably isn't saving as much as intended on this Chrome/Mac.
- 1 × `WebGL: too many errors, no more errors will be reported to the console for this context.` — Chrome's cap hit, most likely by the performance warnings above; no separate GL error text was captured.
- 9 × `The ScriptProcessorNode is deprecated. Use AudioWorkletNode instead.`

## What failed or deviated

- Playwright wasn't in the repo's node_modules; used a scratch-dir install (repo untouched).
- Nothing was listening on port 3000 before the restart, so nothing was stopped.
- dpr was measured with the test window at 1x, so it doesn't show what Retina would get.
- Untracked nested clone `~/chromaglass/chromaglass/` (140 MB, at 59bd3f1) and the regenerated `package-lock.json` are still in the working tree, neither committed.
