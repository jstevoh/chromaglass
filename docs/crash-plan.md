# The black box: crash detection and reporting

The live site has stopped on people and said nothing. The plate freezes, or the
tab reloads itself, and whatever happened just before goes with the page. The
harnesses see everything under `?debug`, but a visitor's machine is the one
place nothing was ever written down. This adds two things:

- **A log** (`src/lib/crashLog.ts`) that records every way a stop can announce
  itself and keeps its record across the reload.
- **A button** (`src/components/CrashReportButton.tsx`) that turns the log into
  a report. It does so only when asked.

## Automatic detection: `crashLog.ts`

**What it listens to:**

| Source | Level | Line `source` |
|---|---|---|
| `window` `error` (uncaught throws; resource failures are skipped) | error | `window` |
| `unhandledrejection` | error | `promise` |
| `console.error` / `console.warn` | error / warn | `console`, or `gpu` when the text says WebGPU |
| The device's `uncapturederror` (already sent to `console.error` in `gpu/device.ts`) | error | `gpu` |
| The device's `.lost` (sent to `console.error` in the visualizer's loss handler) | error | `gpu` |
| Three losses within 60 s: recovery is not holding | **fatal** | `gpu` |
| The loss recovery finishing: a new device, the look laid again | info | `recovery` |
| The heartbeat: no frame for 6 s while the tab is visible | **fatal** | `heartbeat` |
| The heartbeat: frames resume after a stall | info | `heartbeat` |
| The `Boot` error boundary catches: the app is down | **fatal** | `react` |
| Load start, `pagehide` | info | `boot`, `unload` |
| A load whose predecessor never unloaded | warn | `boot` |

**The snapshot.** Every line carries a small snapshot of state. It is built
from providers, and each provider is fenced so that one throwing cannot take
the log down.

- **From the visualizer:**
  - `engine`: the status label
  - `rung`: e.g. `512²@1x`
  - `fps`: from the smoothed frame interval
  - `stepsPerSec`
  - `stats`: `simMs`, `layers`, `beads`, `bubbles`
  - `plate`, `lost`
- **From the app:**
  - `preset`: the active look's name
  - `projector`: `none`, `found WxH`, or `casting to WxH`

**The ring.** It holds 200 lines, and each message is clipped at 600
characters. It persists to localStorage (`chromaglass-crashlog`):

- Info and warn lines are written half a second later, batched.
- Errors and fatals are written at once, because the page may not get another
  chance.

Each line records which load wrote it, so the next load can tell its own lines
from the previous one's tail.

**Reading it, under `?debug`:**

- `chromaglassDebug().crash.last()` is the line that preceded the death: the
  last line the previous load wrote, not counting its `pagehide`.
- `.previous()` is that load's tail, up to 40 lines.
- `.thisLoad()`, `.latest()`, `.lastFatal()`, `.entries()`, and `.clear()`
  cover the rest.
- `.report(note)` builds the report exactly as the button does.

## The button: `CrashReportButton.tsx`

- **Placement.** It sits in the top bar, after Record and Cast. It does
  nothing on its own.
- **Lighting.** When the log records a fatal, the button turns amber and a chip
  asks *"The plate stopped — save a report?"*
  - A fatal that ended the *previous* load lights it too, which is the usual
    case after a crash-and-reload.
  - Dismissing the chip, or saving or sending a report, marks that fatal as
    seen (`chromaglass-crash-seen`), so it does not ask twice.
- **The sheet** has:
  - a note field
  - the last eight lines of the log
  - two checkboxes: *screenshot* and *look and settings*
  - four actions: **Save file**, **Save screenshot**, **Copy text** (the
    report without the picture), and **Send**

  Nothing is captured until one of the four is pressed.
- **Send** appears only when `VITE_CRASH_REPORT_URL` is set at build time.

**The report** is one JSON object, `kind: "chromaglass-crash-report"`,
`version: 1`, containing:

- the note and the URL
- `env`: UA, platform, cores, memory, screen and DPR, visibility, the load id,
  uptime, frames drawn, and the GPU (label, class, software fallback, format,
  and the limits that size the stage)
- the snapshot
- `debug`: the full state `chromaglassDebug()` returns, made JSON-safe
  - Functions are dropped.
  - Typed arrays and GPU objects are summarised.
  - Cycles are cut, and depth and width are capped.

  This state is built with or without `?debug`; only the `window` hook needs
  the flag.
- `look`: the preset name, the settings, `describePlate()`, and the output
  config
- `log`: this load's lines, and `previous`: the last load's tail
- `screenshot`: a 960-pixel JPEG taken through `grabFrame`
  - `grabFrame` is the only read that works: a presented WebGPU canvas reads
    back black.
  - A frame the painter declined carries `painted: false`.
  - The grab is raced against 2 s and fenced, so a dead device gives `null`
    rather than a hang.

## Wiring

The whole of it; everything else is inside the two files.

```ts
// src/main.tsx — first, before the app's chunk is even requested
import { install as installCrashLog, record as crashRecord } from './lib/crashLog';
installCrashLog();            // installCrashLog({ ignore: [/more noise/] }) to extend IGNORE
// …and in Boot.componentDidCatch:
crashRecord('fatal', 'react', message);

// src/components/LiquidVisualizer.tsx — the main effect
const debugState = () => ({ /* what chromaglassDebug returned */, crash: crashLog.crashApi, ... });
if (params.has('debug')) window.chromaglassDebug = debugState;
const unprovide = crashLog.provide('visualizer', () => ({ engine, rung, fps, stepsPerSec, stats, plate, lost }));
crashLog.provideReport({ debug: debugState });
// in render(), after the device-lost early return:
crashLog.beat();
// once the stage is up:
crashLog.provideReport({ gpu: () => ({ label, limits, … }), grab: () => (stage === s ? s.grabFrame() : null) });
// in s.lost.then(…), after the cancelled check:
crashLog.deviceLost(info.reason);
// where the recovery lays the plate again:
crashLog.recovered(`a new device (${s.gpu.label}), ${livePresetRef.current} laid again`);
// cleanup:
unprovide();

// src/App.tsx
crashLog.provide('app', () => ({ preset, projector }));
crashLog.provideReport({ look: () => ({ preset, settings, plate: describePlate(), output }) });
// in the top-bar pill, after the Cast button's wrapper:
<CrashReportButton />
```

**Send**, when it is wanted, needs a Worker that accepts
`POST application/json` and answers 2xx. Then build with
`VITE_CRASH_REPORT_URL=https://…/report`.

- **Where it could live.** The fingerprint Worker could grow a `/report` path,
  or a separate Worker could take it. Neither is written yet.
- **Size.** A report is roughly 10 kB without the picture (measured with no
  GPU); the JPEG adds its own size on top.

### The `ignore` patterns

These are matched against a non-fatal line's text; a match drops the line.
Fatals are never dropped. They cover noise every browser makes that has never
been what stopped a show:

```ts
/ResizeObserver loop/i
/Download the React DevTools/i
/AudioContext was not allowed to start/i
/The play\(\) request was interrupted/i
/favicon/i
/(chrome|moz|safari(-web)?)-extension:\/\//i
/Failed to load resource/i
```

Add to the list with `install({ ignore: [...] })`, not by editing it, so the
defaults stay one list.

## Soak checks: `npm run crash`

A log that has never been seen to record might be an empty box. So each way
of stopping is made to happen, and the script looks for the line it should
leave (`scripts/crash.mjs`). It runs in the macOS job of `checks.yml`, which
has a GPU that presents.

1. **Lines land.** Each of these writes its line with a snapshot:
   - `console.error`
   - an unhandled rejection
   - an uncaught throw

   A `ResizeObserver loop` warning does not. The ring is on disk.
2. **A report always returns** (rule 2). A report built after
   `chromaglassDebug().loseDevice()` has destroyed the device still comes back
   within the timeout, with `screenshot: null`. A healthy report has a painted
   frame no wider than 960.
3. **The loss and the recovery.** A forced loss writes the `gpu` line and then
   the `recovery` line. One loss is not a fatal.
4. **Frames that stop.** With `requestAnimationFrame` stubbed out, the
   heartbeat writes a fatal within its window. The fatal carries `rung` and
   `engine`, and the button lights with its chip.
5. **The reload.** The sheet opens with the tail, and Save file downloads a
   report. After the page is closed and a new one loaded:
   - `crash.last()` is the line written before the close.
   - The previous load's tail is kept.
   - The button is still lit for that load's fatal.

On a machine with no WebGPU that can present (a Linux runner, this container),
the checks in 3 and 4 and the screenshot half of 2 say so and skip. A fatal
written by hand stands in to prove the button.
