# Mac launch after #29

Date: 2026-09-14. Job: bring the show server on James's Mac up on the newest main after PR #29 (Fillmore dye budget 0.9 now that the plate keeps its dye). No GPU look this time; no deploy (the cloud deploys from GitHub Actions).

## Working tree

`git status --short` on main before the pull:

```
 M package-lock.json
?? chromaglass/
```

Only the usual locally modified package-lock.json and the stray nested `chromaglass/` clone, both left alone. Nothing stashed.

## Commit

`git checkout main && git fetch origin main && git pull --ff-only origin main` fast-forwarded cf9332e..b13c139 (CHANGELOG.md and src/presets.ts, 4 insertions, 1 deletion).

```
b13c139 Fillmore on a plate that keeps its dye: budget 0.9 (#29)
```

## Build

`npm install` finished with only the usual audit notice. `npm run build` tail:

```
transforming...
✓ 2123 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                          1.32 kB │ gzip:   0.57 kB
dist/assets/songMapWorker-Dc5_FQYD.js    5.77 kB
dist/assets/index-DB-0v7-8.css          49.48 kB │ gzip:   8.62 kB
dist/assets/useRemoteLink-BnQPYlQq.js    4.47 kB │ gzip:   2.08 kB
dist/assets/CastDisplay-D7O1FEav.js      6.97 kB │ gzip:   2.63 kB
dist/assets/RemoteControl-BK0scvfK.js   25.33 kB │ gzip:   6.97 kB
dist/assets/presets-CBzJh8zE.js         30.17 kB │ gzip:   7.15 kB
dist/assets/castProtocol-Bh0W_KDS.js   182.05 kB │ gzip:  58.86 kB
dist/assets/index-Nju8cbE6.js          196.50 kB │ gzip:  61.71 kB
dist/assets/App-CAMAJdYz.js            349.28 kB │ gzip: 104.32 kB
✓ built in 1.28s
```

## Server restart

Old server: pid 14778 (the #28 launch, show key 2355) was listening on 3000; killed with `pkill -f "node server/remote-server.js"`, port confirmed free.

Started `(nohup npm run remote > ~/chromaglass-server.log 2>&1 &)`. `tail -20 ~/chromaglass-server.log` after 4 s:

```
> chromaglass@1.2.0 remote
> node server/remote-server.js


  ChromaGlass show server

  Show key:           8142
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000  (/chromaglass/setting/<key> <n>, /chromaglass/action/<name>, /chromaglass/preset <id>, /blow /drop /press /tilt /dye)
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=8142
  Network display:    http://192.168.0.234:3000/?cast=true&key=8142

  Same Wi-Fi: use the addresses above. Across buildings, other access points
  or the internet: run "npm run tunnel" in another window and use the https
  address it prints, with ?cast=true&key=8142 or ?remote=1&key=8142.
```

New server pid 15430, show key **8142**.

## HTTP check

```
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
200
```

James's Chrome tabs and the projector window were not touched; they will pick up the new build on their next reload.
