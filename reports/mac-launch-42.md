# Mac launch and looks after #42

2026-09-15, morning. The Mac is on `main` at b687f94 "Lacing: the threads that outline a boundary, drawn by the strain across it (#42)".

*This report is pushed in stages. The launch section is final. The lacing looks follow.*

## 1. Launch

- **Pull.** I stashed only `package-lock.json`, fast-forwarded 129ad9b → b687f94 (#42), and popped the stash. #42 doesn't touch the lockfile, so the pop was clean and the local edit is kept. A backup is at `/tmp/package-lock.local-backup-42.json`. The nested `chromaglass/` clone is untouched. No `npm install`.
- **Build.** `npm run build`: OK in 1.18 s.
- **Restart.** I killed the old server (pid 25271, key 9281) and started `npm run remote` with nohup. The log is in `~/chromaglass-server.log`.

| | |
|---|---|
| Server pid | **30897** |
| Show key | **1678** |
| Phone | http://192.168.0.234:3000/?remote=1&key=1678 |
| Network display | http://192.168.0.234:3000/?cast=true&key=1678 |
| `curl http://localhost:3000/` | 200, 1320 bytes |

- The key changed, so any tab or display still holding key 9281 needs a reload with 1678. I left James's Chrome and the projector alone. James's Chrome has one tab open, and it isn't the show.
- **Load at the start:** GPU utilisation 94 %, load average 4.3. Timings below are compared by frames, not seconds.
