# Mac launch and looks after #43

2026-09-15, late morning. The Mac is on `main` at aab272f "Lacing: threads at a boundary, not a contour map (#43)".

## 1. Launch

- **Pull.** I stashed only `package-lock.json`, fast-forwarded b687f94 → aab272f (#43: `CHANGELOG.md` and `LiquidVisualizer.tsx`), and popped the stash cleanly, so the local lockfile edit is kept. The nested `chromaglass/` clone is untouched. No `npm install`.
- **Build.** `npm run build`: OK in 1.16 s.
- **Restart.** I killed the old server (pid 30897, key 1678) and started `npm run remote` with nohup. The log is in `~/chromaglass-server.log`.

| | |
|---|---|
| Server pid | **32470** |
| Show key | **7699** |
| Phone | http://192.168.0.234:3000/?remote=1&key=7699 |
| Network display | http://192.168.0.234:3000/?cast=true&key=7699 |
| `curl http://localhost:3000/` | 200, 1320 bytes |

- The key changed, so any tab or display still holding key 1678 needs a reload with 7699. I left James's Chrome and the projector alone. James's Chrome has one tab open (a news site), and it isn't the show.
- **Load at the start:** GPU utilisation 41 %, load average 3.7 (OBSBOT Center 84 % CPU, MOTIV Mix 58 %). That is quieter than #42's 94 %.

## 2. Lacing, second pass

*In progress.*
