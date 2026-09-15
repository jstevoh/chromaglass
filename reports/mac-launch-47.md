# Mac launch and looks after #47

2026-09-15, afternoon. The Mac is on `main` at 6a55c11 "The steepness gate, where the plate says it belongs (#47)".

**In short**
- **Launch:** server pid **36169**, show key **5950**, curl 200. Details in §1.
- Looks to follow.

## 1. Launch

- **Pull.** I stashed only `package-lock.json`, fast-forwarded 838c571 → 6a55c11 (#46 presets on the title, #47 the steepness gate), and the stash popped cleanly, so the local lockfile edit is kept. The nested `chromaglass/` clone is untouched. No `npm install`.
- **What landed** (checked in the diff): `band = smoothstep(0.05, 0.3, span) * smoothstep(0.08, 0.20, al)`, and Fillmore's `lacing` 0.5 → 0.55. #46 removes the settings panel's copy of the presets and adds two `qa.mjs` checks.
- **Build.** `npm run build`: OK in 1.15 s.
- **Restart.** I killed the old server (pid 34070, key 1703) and started `npm run remote` with nohup. The log is in `~/chromaglass-server.log`.

| | |
|---|---|
| Server pid | **36169** |
| Show key | **5950** |
| Phone | http://192.168.0.234:3000/?remote=1&key=5950 |
| Network display | http://192.168.0.234:3000/?cast=true&key=5950 |
| `curl http://localhost:3000/` | 200, 1320 bytes |

- The key changed, so any tab or display still holding key 1703 needs a reload with 5950. I left James's Chrome and the projector alone. James's Chrome has one tab open (a news site), and it isn't the show.
- **Load at the start:** GPU utilisation 57 %, load average 4.0.
