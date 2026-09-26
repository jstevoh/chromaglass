---
name: crash-triage
description: Turn a ChromaGlass crash report (chromaglass-report-*.json from the corner dot or the sheet) or the report Worker's digest into a cause in the code, a reproduction, and a fix. Use when the user attaches or mentions a report, says the plate froze, went black or reloaded itself, or asks what crashed this week.
---

# Crash triage: from a report to a fix

The black box is described in `docs/crash-plan.md`. The log is
`src/lib/crashLog.ts`, the button is `src/components/CrashReportButton.tsx`,
and the Worker that collects **Send** is `server/report-worker.js`. Read the
plan once if it isn't already in context. Everything below assumes it.

## 1. Get the report

- **A file.** On the Mac, the reports are in `~/Downloads/chromaglass-report-*.json`.
  In a cloud session the user attaches them, and they land under
  `/mnt/project-files/uploads/` (named by ID; `file` shows they are JSON).
- **The digest.** Everything sent in the last N days, grouped by the line it
  died on:
  `curl -H "Authorization: Bearer $DIGEST_TOKEN" https://<worker>/digest?days=7`,
  or yesterday's from R2:
  `npx wrangler r2 object get chromaglass-reports/digests/<YYYY-MM-DD>.json`.
  One report is `GET /report/<id>`. These need the token and Cloudflare
  credentials. If the session doesn't have them, ask the owner to run the
  command and attach the output. Never ask for the token itself in chat.

## 2. Read it without drowning

A report is 10–150 kB, mostly picture and `debug` state. Start with the
summary:

```
node .claude/skills/crash-triage/summarize.mjs <report.json> [more …]
node .claude/skills/crash-triage/summarize.mjs --digest <digest.json>
```

It prints the environment, the GPU, the snapshot, the line the report died
on (the last fatal, or else the previous load's last line before its
`pagehide`), each load in the ring and whether it unloaded cleanly, and the
error tail. Go to the raw JSON (`jq`) only for what the summary points at:
`.debug.webgpu`, `.look.settings`, `.history`.

## 3. Name the kind of stop

| The line | What it usually means | Where to look |
|---|---|---|
| `fatal gpu` with three losses in 60 s | Device loss recovery is not holding | the loss handler and the recovery in `LiquidVisualizer.tsx` (`crashLog.deviceLost`, `crashLog.recovered`) |
| `error gpu` `uncapturederror` | A validation error: a bind group, a buffer size, a limit | `src/gpu/**`, and the limits in `env.gpu` against what the rung asked for |
| `fatal heartbeat` (no frame for 20 s) | The render loop stopped, or the main thread is blocked | what the snapshot's `stats` and `rung` say was running, and the lines just before it |
| `error heartbeat` then `info heartbeat` | A long task that let go (a stall, not a stop) | the action just before it: a panel opening, a song-map decode |
| `fatal react` | The error boundary caught a throw, so the app is down | the component in the message's stack |
| `warn boot`: the predecessor never unloaded | The tab was killed: OOM, the GPU process, or the OS | the previous load's tail, `memoryGB`, the rung, `stats.layers` and `bubbles` |
| nothing fatal, and the note says it froze | The log didn't see it. That's a gap in the log | say so, and propose what `crashLog.ts` should have listened to |

The snapshot (`engine`, `rung`, `fps`, `stepsPerSec`, `stats`, `preset`,
`projector`) says what the show was doing. A crash that only happens on one
preset, one rung, or with a projector attached is a strong lead, so check it
across every report in the digest group, not just one.

## 4. Reproduce

- `npm run crash` is the pattern: it builds, serves, opens
  `/?debug&look=<preset>&tier=local`, and forces each kind of stop. To
  reproduce a report, copy its approach into a scratchpad script with the
  report's preset, settings (`?set=key=value`) and rung. Promote it to a
  check in `scripts/crash.mjs` only if the cause could come back.
- A cloud container has no presenting GPU. Device loss, stalls and
  screenshots can't be reproduced here (`npm run crash` skips them and says
  so). Reproduce what you can, reason from the code for the rest, and say
  which is which. Anything that needs the Mac goes to the owner as a short
  recipe: the URL, what to do, and what to watch for.
- Under `?debug`, `chromaglassDebug().crash.last()`, `.previous()` and
  `.lastFatal()` read the log live.

## 5. Fix and report

- Fix the cause, not the log line. Adding a pattern to `IGNORE` is only
  right for browser noise that has never stopped a show, and the plan's
  list is the bar. A fatal is never ignored.
- If the log missed the stop, the fix includes teaching `crashLog.ts` to see
  it, with a check in `scripts/crash.mjs` that is seen to fail first (the
  `check-skeptic` agent).
- Run the checks `CLAUDE.md` ("Which checks for which files") names, then the `prepush-reviewer`
  agent, then open a draft PR.
- Tell the user what stopped, how often (from the digest), what it was
  doing, whether it was reproduced or reasoned, and the PR.
