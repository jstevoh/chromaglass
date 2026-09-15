# Mac launch and looks after #39

2026-09-14, late night. The Mac is on `main` at ba3733f "The pigment grain was never drawn for the first nine hundred steps (#39)".

*This report is pushed in parts. Sections after §1 are still to come if they are not below.*

## 1. Launch

- **Pull.** `git pull --ff-only` refused at first: #38 adds `playwright` to `package-lock.json`, and the local lockfile edit is in the way.
  - The two edits touch different parts of the file. The local edit drops 531 lines of optional `@esbuild/*` platform packages; #38 adds the `playwright` and `playwright-core` entries.
  - So I stashed only the lockfile, fast-forwarded f960f9b → ba3733f (#38 and #39), and popped the stash. It merged cleanly.
  - The lockfile is still modified locally: the 531 deleted lines are still gone, and #38's playwright entries are in it. A backup of the local file from before the pull is at `/tmp/package-lock.local-backup-39.json`.
  - The nested `chromaglass/` clone is untouched.
- **No `npm install`.** #38's only new dependency is `playwright`, a dev dependency the build does not use, and an install would rewrite the local lockfile.
- **Build.** `npm run build`: OK in 3.27 s.
- **Restart.** I killed the old server (pid 23447, key 7594) and started `npm run remote` with nohup. The log is in `~/chromaglass-server.log`.

| | |
|---|---|
| Server pid | **25271** |
| Show key | **9281** |
| Phone | http://192.168.0.234:3000/?remote=1&key=9281 |
| Network display | http://192.168.0.234:3000/?cast=true&key=9281 |
| `curl http://localhost:3000/` | 200, 1320 bytes |

- The key changed, so any of James's tabs or displays still holding key 7594 need a reload with 9281. I left James's Chrome and the projector alone.
- **Load:** GPU utilisation 99 % and load average 5.3–5.5 at the start (MOTIV Mix, James's Chrome, WindowServer). That is the same as #37, so timings below are compared by frames, not seconds.
