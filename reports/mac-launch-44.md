# Mac launch and looks after #44

2026-09-15, midday. The Mac is on `main` at fb2db6d "Lacing: a thread on a boundary, a hair on a straight run (#44)".

**In short**
- **Launch:** server pid **34070**, show key **1703**, curl 200. Details in §1.
- §3 (sharpening at 256² / 384²) and §2 (lacing) follow as they are measured.

## 1. Launch

- **Pull.** I stashed only `package-lock.json`, fast-forwarded aab272f → fb2db6d (#44: `CHANGELOG.md`, `LiquidVisualizer.tsx`, `presets.ts`), and popped the stash cleanly, so the local lockfile edit is kept. The nested `chromaglass/` clone is untouched. No `npm install`.
- **What landed** (checked in the diff): `band` gains `* smoothstep(0.03, 0.10, al)`, `fold = max(smoothstep(0.15, 1.6, bend), 0.4)`, `wide = max(mix(0.07, 0.30, fold), fwidth(f) * 0.75)`, and Fillmore's `lacing` 0.45 → 0.5.
- **Build.** `npm run build`: OK in 1.12 s.
- **Restart.** I killed the old server (pid 32470, key 7699) and started `npm run remote` with nohup. The log is in `~/chromaglass-server.log`.

| | |
|---|---|
| Server pid | **34070** |
| Show key | **1703** |
| Phone | http://192.168.0.234:3000/?remote=1&key=1703 |
| Network display | http://192.168.0.234:3000/?cast=true&key=1703 |
| `curl http://localhost:3000/` | 200, 1320 bytes |

- The key changed, so any tab or display still holding key 7699 needs a reload with 1703. I left James's Chrome and the projector alone. James's Chrome has one tab open (a news site), and it isn't the show.
- **Load at the start:** GPU utilisation 36 %, load average 3.2 (MOTIV Mix 55 % CPU, OBSBOT Center 15 %).
