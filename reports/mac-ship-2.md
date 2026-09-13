# Mac ship report 2 — 2026-09-13

Run on James's Mac (`~/chromaglass`, Darwin 25.5.0) from a task relayed by the cloud session chromaglass-69. Shipping PR #17 (the stage kit) and PR #18 (Fillmore East, 1969).

## Summary

| Step | Result |
|---|---|
| 1. Stop old server | OK — node pid 3024 was listening on 3000; killed. Nested clone `chromaglass/` and `package-lock.json` left alone |
| 2. Pull, install, build | OK — local main was already at 9c3fd6c; `git pull` said "Already up to date"; install and build clean |
| 2. Deploy | **Not run from this session** — `npm run deploy` was blocked by the Claude Code permission classifier ("Production Deploy"). The live site nevertheless already serves this exact build (see step 3), so nothing is missing from the cloud |
| 2. Show server | OK — running detached, show key 1410, LAN host 192.168.0.234, OSC on udp 9000 |
| 3. Live site | **Match** — index chunk, App chunk, manifest and immutable asset headers all verified |
| 4. Screenshots | OK — GPU engine, 512² grid, 1.0x dpr, ~17 ms frames throughout. Four pictures in this folder |

## 1. Stop the old server

```
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
COMMAND  PID         USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    3024 jameshiggins   16u  IPv4 0x53c484bb9ad00521      0t0  TCP *:3000 (LISTEN)
$ kill 3024
```

Working tree before and after: `M package-lock.json`, `?? chromaglass/` (the same as the last report). Neither blocked the pull; no stash needed.

## 2. Pull, install, build, deploy, start

```
$ git pull origin main
From https://github.com/jstevoh/chromaglass
 * branch            main       -> FETCH_HEAD
Already up to date.
$ git log --oneline -1
9c3fd6c Fillmore East, 1969: fingering, oil beads, projectors, plate cells, and the preset (#18)
```

`npm install`: clean (npm audit still reports vulnerabilities; not acted on).

```
$ npm run build
vite v6.4.1 building for production...
✓ 2122 modules transformed.
dist/index.html                          1.32 kB │ gzip:   0.58 kB
dist/assets/songMapWorker-Dc5_FQYD.js    5.77 kB
dist/assets/index-BOOQhiEr.css          47.31 kB │ gzip:   8.25 kB
dist/assets/useRemoteLink-B8hS6Jem.js    4.47 kB │ gzip:   2.08 kB
dist/assets/CastDisplay-X4rCLI2a.js      6.07 kB │ gzip:   2.33 kB
dist/assets/RemoteControl-DLnUL59z.js   25.33 kB │ gzip:   6.97 kB
dist/assets/presets-lF2ZLOno.js         30.17 kB │ gzip:   7.15 kB
dist/assets/castProtocol-DSkVUL6o.js   178.70 kB │ gzip:  57.64 kB
dist/assets/index-p8o2M65G.js          196.50 kB │ gzip:  61.71 kB
dist/assets/App-BQqpq0w6.js            343.37 kB │ gzip: 102.36 kB
✓ built in 1.05s
```

### Deploy

`npm run deploy` (`npx firebase-tools deploy --only hosting`) was **denied by the Claude Code auto-mode permission classifier** as a production deploy. It was not retried or worked around. Because the live site already serves `index-p8o2M65G.js` / `App-BQqpq0w6.js` (the hashes this build produced), the cloud is already at 9c3fd6c; whoever deployed last did so from the same source. If James wants a deploy from this Mac anyway, run `npm run deploy` in `~/chromaglass` by hand, or allow the command in Claude Code's settings.

### Show server

```
$ (nohup npm run remote > ~/chromaglass-server.log 2>&1 &)
$ tail -20 ~/chromaglass-server.log

  ChromaGlass show server

  Show key:           1410
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000  (/chromaglass/setting/<key> <n>, /chromaglass/action/<name>, /chromaglass/preset <id>, /blow /drop /press /tilt /dye)
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=1410
  Network display:    http://192.168.0.234:3000/?cast=true&key=1410
```

## 3. Live site

| Check | Local `dist/` | Live `https://chromaglass.web.app` |
|---|---|---|
| index chunk | `assets/index-p8o2M65G.js` | `assets/index-p8o2M65G.js` |
| App chunk referenced by the index chunk | `App-BQqpq0w6.js` | `App-BQqpq0w6.js` |
| `fillmore-1969` occurrences in App chunk | 2 | 2 |
| `blackout-toggle` occurrences in App chunk | 7 | 7 |

```
$ curl -s https://chromaglass.web.app/manifest.webmanifest | head -c 400
{
  "name": "ChromaGlass",
  "short_name": "ChromaGlass",
  "description": "A liquid light show that plays to your music.",
  "id": "/",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone", "fullscreen"],
  ...
$ curl -sI https://chromaglass.web.app/assets/index-p8o2M65G.js | grep -iE 'HTTP/|cache-control'
HTTP/2 200
cache-control: public, max-age=31536000, immutable
```

## 4. Screenshots on the real GPU

Playwright installed into `~/cg-scratch` (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install playwright`), driving the installed Google Chrome headed (`channel: 'chrome', headless: false`) at 1600×1000 against `http://localhost:3000/?debug`. The canvas filled the viewport (bounding box 0,0 1600×1000), so the press landed at pixel (921, 517). No page errors were logged. Script: `~/cg-scratch/shoot.mjs`; raw numbers in `engine-status-2.json`.

### Engine numbers (`window.chromaglassDebug().status`)

| Moment | engine | grid | dpr | tier / gpu | governed | steppedDown | frameMs | beads |
|---|---|---|---|---|---|---|---|---|
| initial (10 s after load) | gpu | 512 | 1.0 | local / strong | yes | no | 17.00 | 0 |
| Fillmore East, 1969 (25 s) | gpu | 512 | 1.0 | local / strong | yes | no | 17.51 | 312 |
| after the 4 s press (+2 s) | gpu | 512 | 1.0 | local / strong | yes | **yes** | 16.70 | 312 |
| blackout (2 s) | gpu | 512 | 1.0 | local / strong | yes | yes | 16.95 | 312 |
| Classic Light Show (20 s) | gpu | 512 | 1.0 | local / strong | yes | yes | 16.97 | 312 |

Frame time with beads on (Fillmore, 312 beads) versus the classic preset: 17.5 ms against 17.0 ms. Both sit on the 60 fps governor at 512², so beads cost nothing measurable at this size. The governor's `steppedDown` flag flipped to true during or after the held press and stayed true; the grid and dpr did not change, so it looks like the governor tried to step up and backed off, or the press's frames spiked briefly. Worth a look but not a problem on the wall.

### fillmore-gpu.png

Reads as the Joshua Light Show photo in its bones: one big dish right of centre on black, a warm orange-yellow field densely packed with small dark-rimmed beads, a cool icy-blue core (a blue bead-filled blob with a bright rim) just below the dish's centre, cherry red across the top and right, a green wisp at the upper left and a cyan blob at the upper right, and a second smaller, dimmer purple-to-blue dish overlapping at the left. Black beyond both rims and no sign of the square plate; each dish carries a faint tan rim ring. Things off: the beads are near-uniform in size and pack into a regular honeycomb in the centre, so at this scale they read more like bubble-wrap or a flat ring texture than oil beads, especially over the dark red and over the cyan blob where the interiors are not lit; the cyan and blue blobs have a hard, bright yellow-white edge; and the left dish shows two thin straight dark horizontal lines across it (at about a quarter and half its height) that look like a seam or row artefact rather than dye.

### fillmore-press-gpu.png

The 4 s press at the big dish's centre did not make radial fingers. The blue core and the cyan blob above it were squeezed together into one elongated diagonal S-shape with the same hard bright rim, and the warm field around the press point thinned and darkened, but the front is smooth; no spokes or Saffman–Taylor fingers are visible anywhere round the press. The bead field is unchanged in character. The left dish's horizontal lines are more visible in this frame.

### blackout-gpu.png

Blackout works: the plate is fully black with only a faint dark-navy glow at the centre, the toolbars stay lit, and a red "BLACKOUT · B" chip sits at the top. Pressing `b` again brought the picture back (the classic frame that follows is lit).

### classic-gpu.png

The seeded blobs are round now: magenta/red, blue and yellow regions with smooth round boundaries and no square corners. The dish clips the dye at its rim on the right and top with a soft edge. Two findings: **the Fillmore settings leaked into Classic** — the second small dish is still drawn at the left (empty), and bead rings are visible across the yellow and red dye, with a fine cell texture in the blue. `applyPreset` in `src/App.tsx` merges the preset over the previous settings (`{ ...prev, macroMode: false, renderStyle: 'show', ...presetSettings }`), and Classic does not mention `dishSpread`, `beads`, `cells` or `fingering`, so they stay at Fillmore's 0.85 / 0.7 / 0.55 / 0.85. The debug hook confirms 312 beads still alive on Classic. The same fix that resets `macroMode` there should reset the four new settings (or every preset should set them). This will affect any preset chosen after Fillmore, including the On-a-New-Song switch.

## 5. What was not done

- The Firebase deploy from this Mac (blocked; the live site is already current).
- Nothing committed besides `reports/`; `package-lock.json` and `chromaglass/` untouched; nothing pushed to main.
