# Mac launch and looks after #49

2026-09-15, night. The Mac is on `main`.

**In short**
- **Launch:** server pid **43741**, show key **7113**, curl 200. Details in §1.
- **`main` is not where the brief expected it.** Head is **69e59ca**, four merges past `e42bd48`: #50 the manual and the bottles, #51 a duplicate Band button, #52 the desk (a look change that does not cut to black), #53 the settings panel as a control surface. `lacing()` itself is byte-identical to #49, so what I measure is #49's shader — but the plate around it is not the one #47 ran on.
- **The harness broke again, in the same place and for a new reason.** #49 taught it to pick Fillmore from the title menu. #52's desk made picking from that menu only *cue* a preset: it sits in a cue bar as CUED against ON STAGE, and lands on the glass on **Go**, over a crossfade. So the click loaded nothing and the first page ran Classic Light Show with `lacing` 0. The harness now sets the fade to `cut` and presses Go, and checks `settings.lacing` is 0.55 before it measures. **Anything else driving this app from a script needs the same fix.**

*(§2–§4 follow as they are measured.)*

## 1. Launch

- **Pull.** `main` was already at 69e59ca when I arrived and matched `origin/main`, so nothing to fast-forward. I stashed `package-lock.json` first, ran `npm run show`, and popped it after; the popped file is byte-identical to the stashed one and parses, and the redundant stash entry is dropped. The pre-existing `auto-stash before local deploy` entry is left alone. The nested `chromaglass/` clone is untouched.
- **What I am measuring.** `git diff e42bd48 main -- LiquidVisualizer.tsx` touches 287 lines, but none of them are inside `lacing()` — the change is the liquid-phase work (soap that keeps pulling, glycerine that crawls). The walk, `reach`, `mid`, `wide` and the `mix(0.55, 1.0, fold)` weight are exactly as #49 landed them.
- **Build.** `npm run show` = `update && remote`, so it pulled, installed and built: OK in 11.96 s. It does not publish. I did not run `deploy` or `ship`.
- **Restart.** The server I found was **not** pid 36169 — that one had died and a `npm run remote` was running from a terminal as pid 42401 (up 1 h 20 m, build from 20:47, still printing key 5950). I killed it and its npm parent and started `npm run show` under nohup. The log is `~/chromaglass-server.log`. **The key changed, so any tab or display still holding 5950 needs a reload with 7113** — the projector's display reconnected to the new server on its own.

| | |
|---|---|
| Server pid | **43741** |
| Show key | **7113** |
| Phone | http://192.168.0.234:3000/?remote=1&key=7113 |
| Network display | http://192.168.0.234:3000/?cast=true&key=7113 |
| `curl http://localhost:3000/` | 200, 1320 bytes |

- The shader bundle is now `castProtocol-C1Gtztjk.js`. All nine of my patch anchors in `lacing()` appear exactly once in it, and the page-only patch compiles (`__patched` 1).
- **Load at the start:** load average 10.5 (the build had just run), GPU utilisation 43 %. I re-read both before the timing page.
- James's Chrome and the projector are left alone.

### The cue bar, and what it costs a script

Before #52, `[data-testid="preset-menu-fillmore-1969"]` put Fillmore on the glass. Now it arms it:

> ON STAGE — Classic Light Show → CUED — Fillmore East, 1969 — [2s] — [Go]

and the plate keeps running whatever was already on it until Go. My first page of the night measured Classic Light Show at `lacing` 0 and would have reported it as Fillmore. The fix is two lines — select `cut` on `[data-testid="cue-fade"]`, click `[data-testid="cue-go"]` — plus a read-back of `chromaglassDebug().settings` before measuring, which is what caught it. For a live desk the cue bar is right; it is a trap for anything automated, and worth a note in the repo.
