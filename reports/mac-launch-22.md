# Mac launch report after #22

Date: 2026-09-13. Show server brought up on the newest main on the ChromaGlass Mac. No deploy run, nothing committed to main.

## Git status before pull

```
 M package-lock.json
?? chromaglass/
```

Stash list was empty. Only package-lock.json was modified, so nothing was stashed. The nested `chromaglass/` clone and package-lock.json were left alone.

## Commit now on main

```
4b3c47a A projector on HDMI, noticed and used: Ask, Automatic, Off (#22)
```

Fast-forwarded from fa37a1f. Six files changed, including the new `src/hooks/useProjector.ts`.

## Build tail

```
✓ 2123 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                          1.32 kB │ gzip:   0.58 kB
dist/assets/songMapWorker-Dc5_FQYD.js    5.77 kB
dist/assets/index-BNXgBg9D.css          47.64 kB │ gzip:   8.29 kB
dist/assets/useRemoteLink-rkUZ4kJX.js    4.47 kB │ gzip:   2.08 kB
dist/assets/CastDisplay-pESAWV0b.js      6.07 kB │ gzip:   2.33 kB
dist/assets/RemoteControl-wt4bCGMI.js   25.33 kB │ gzip:   6.98 kB
dist/assets/presets-Bj1sEsiD.js         30.17 kB │ gzip:   7.15 kB
dist/assets/castProtocol-Dx89F6z-.js   181.08 kB │ gzip:  58.51 kB
dist/assets/index-BVxYr1pt.js          196.50 kB │ gzip:  61.71 kB
dist/assets/App-DzceJgWO.js            347.27 kB │ gzip: 103.52 kB
✓ built in 1.96s
```

## Server

Old server (pid 4801, `node server/remote-server.js`) was killed. No stale `vite preview` was running. New server started detached with nohup, pid 5497, log at `~/chromaglass-server.log`.

```
> chromaglass@1.2.0 remote
> node server/remote-server.js

  ChromaGlass show server

  Show key:           7682
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000  (/chromaglass/setting/<key> <n>, /chromaglass/action/<name>, /chromaglass/preset <id>, /blow /drop /press /tilt /dye)
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=7682
  Network display:    http://192.168.0.234:3000/?cast=true&key=7682

  Same Wi-Fi: use the addresses above. Across buildings, other access points
  or the internet: run "npm run tunnel" in another window and use the https
  address it prints, with ?cast=true&key=7682 or ?remote=1&key=7682.
```

HTTP check: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` printed **200**.

## Served build check

| Check | Result |
|---|---|
| Index chunk served | `assets/index-BVxYr1pt.js` |
| `chromaglass-projector-mode` in index chunk | 0 (expected, it lives in the App chunk) |
| App chunk referenced by index | `assets/App-DzceJgWO.js` |
| `chromaglass-projector-mode` in dist App chunk | 1 |
| `chromaglass-projector-mode` in served App chunk (via localhost:3000) | 1 |

The server is serving the #22 build.

## Display info

```
Color LCD:
  Display Type: Built-in Liquid Retina Display
  Resolution: 2560 x 1664 Retina
  Main Display: Yes
  Mirror: Off
  Connection Type: Internal
```

Only the built-in display is attached. No second display (no HDMI projector, no NEBULA) was present at launch time, so the new projector detection could not be exercised. When a projector is plugged in, the display will be extended rather than mirrored unless macOS mirroring is turned on.
