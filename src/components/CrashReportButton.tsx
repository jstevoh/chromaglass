import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LifeBuoy } from 'lucide-react';
import { Button, Sheet } from './ui';
import * as crashLog from '../lib/crashLog';
import { downloadText } from '../lib/userPresets';

/**
 * The crash report (docs/crash-plan.md).
 *
 * Sits beside Record and Cast and does nothing on its own. When the log
 * records a fatal — this load's, or the one the previous load ended on — it
 * lights, and a chip offers to save a report. Nothing is captured until one
 * of the sheet's buttons is pressed; Send only exists when a Worker is wired
 * (`VITE_CRASH_REPORT_URL`).
 *
 * The chip is a notice, not a fixture: it goes by itself after a few
 * seconds and the lit button carries on saying so, because a chip that
 * stays up sits over whatever control is under it — the preset title on a
 * phone, the recipe picker on the desk — for the rest of the show.
 */

const SEEN = 'chromaglass-crash-seen';
const readSeen = () => { try { return Number(localStorage.getItem(SEEN) ?? 0); } catch { return 0; } };
const markSeen = (t: number) => { try { localStorage.setItem(SEEN, String(t)); } catch { /* private window */ } };

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const CHIP_MS = 12_000;

/** Open the report sheet from anywhere — the command palette, the desk. */
export const OPEN_CRASH_REPORT = 'chromaglass:crash-report';
export const openCrashReport = () => window.dispatchEvent(new Event(OPEN_CRASH_REPORT));

export function CrashReportButton({ floating = false }: {
  /**
   * Under a desk, whose header has no room for a button that is idle nearly
   * always: no button, only the chip when there is news, and the sheet when
   * the palette asks for it.
   */
  floating?: boolean;
}) {
  const [fatal, setFatal] = useState<crashLog.CrashEntry | null>(() => {
    const f = crashLog.lastFatal();
    return f && f.t > readSeen() ? f : null;
  });
  const [chip, setChip] = useState(() => fatal !== null);
  const [open, setOpen] = useState(false);

  useEffect(() => crashLog.subscribe((e) => {
    if (e.level !== 'fatal') return;
    setFatal(e);
    setChip(true);
  }), []);
  useEffect(() => {
    if (!chip) return;
    const t = setTimeout(() => setChip(false), CHIP_MS);
    return () => clearTimeout(t);
  }, [chip, fatal]);
  useEffect(() => {
    const show = () => { setOpen(true); setChip(false); };
    window.addEventListener(OPEN_CRASH_REPORT, show);
    return () => window.removeEventListener(OPEN_CRASH_REPORT, show);
  }, []);

  /** Seen: the button goes dark and this fatal does not ask again, on this load or the next. */
  const acknowledge = useCallback(() => {
    if (fatal) markSeen(fatal.t);
    setFatal(null);
    setChip(false);
  }, [fatal]);

  const lit = fatal !== null;
  const chipUp = lit && chip && !open;

  const chipEl = chipUp && (
    <div
      className={`${floating ? 'fixed right-4 top-16 z-50' : 'absolute right-0 top-full mt-2'} flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-400/40 bg-[#0b0b10]/95 py-1 pl-3 pr-1 text-[12px] text-white/90 shadow-2xl backdrop-blur-xl pointer-events-auto`}
      style={{ animation: 'chromaglass-menu-in 0.15s ease-out' }}
      data-testid="crash-chip"
    >
      <span>The plate stopped — save a report?</span>
      <button onClick={() => { setOpen(true); setChip(false); }} className="min-h-[28px] rounded-full bg-amber-500 px-3 font-medium text-black hover:bg-amber-400">Report</button>
      <button onClick={acknowledge} className="min-h-[28px] min-w-[28px] rounded-full text-white/50 hover:text-white" aria-label="Dismiss">✕</button>
    </div>
  );
  const sheet = open && createPortal(
    <ReportSheet fatal={fatal} onClose={() => setOpen(false)} onDone={acknowledge} />,
    document.body,
  );

  if (floating) return <>{chipEl}{sheet}</>;
  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(true); setChip(false); }}
        className={`p-2 rounded-full transition-all ${lit ? 'bg-amber-500 text-black' : 'hover:bg-white/10 text-white/60'}`}
        title={fatal ? 'The plate stopped — save a report' : 'Save a report of what the show was doing'}
        data-testid="crash-report-button"
        data-lit={lit ? 'true' : undefined}
      >
        <LifeBuoy size={14} />
      </button>
      {chipEl}
      {sheet}
    </div>
  );
}

/**
 * The quiet one: a dot in the corner that saves a report in one click.
 *
 * The lit button only lights on a stop the log recognises, and under a desk
 * there is no button at all — so a crash that reloads the tab, or one noticed
 * a minute later, left no obvious way to keep what the log knew. This is
 * always there, on every screen, and asks nothing: the report, with the
 * picture and the whole ring (every load it still holds), goes straight to
 * Downloads as `chromaglass-report-<time>.json`, where Claude Code on the
 * same machine can read it.
 *
 * Faint on purpose, and fixed in the corner so it sits over no control.
 */
export function QuickReportDot() {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  useEffect(() => {
    if (state !== 'saved' && state !== 'failed') return;
    const t = setTimeout(() => setState('idle'), 2500);
    return () => clearTimeout(t);
  }, [state]);
  const save = async () => {
    if (state === 'saving') return;
    setState('saving');
    try {
      crashLog.record('info', 'report', 'saved by hand from the corner dot');
      const report = await crashLog.buildReport({ note: 'saved from the corner dot' });
      downloadText(`chromaglass-report-${stamp()}.json`, JSON.stringify(report, null, 2));
      setState('saved');
    } catch {
      setState('failed');
    }
  };
  return (
    <button
      onClick={() => { void save(); }}
      className="group fixed bottom-1 right-1 z-[70] flex h-6 w-6 items-center justify-center rounded-full pointer-events-auto"
      aria-label="Save a crash report to Downloads"
      title="Save a crash report to Downloads"
      data-testid="quick-report"
    >
      <span
        className={`block h-1.5 w-1.5 rounded-full transition-colors ${
          state === 'saved' ? 'bg-emerald-400' : state === 'failed' ? 'bg-red-500' : state === 'saving' ? 'bg-white/60' : 'bg-white/15 group-hover:bg-white/60'
        }`}
      />
      {(state === 'saved' || state === 'failed') && (
        <span className="pointer-events-none absolute bottom-7 right-0 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[11px] text-white/90" data-testid="quick-report-said">
          {state === 'saved' ? 'Report saved to Downloads' : 'Could not save the report'}
        </span>
      )}
    </button>
  );
}

function ReportSheet({ fatal, onClose, onDone }: { fatal: crashLog.CrashEntry | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [withShot, setWithShot] = useState(true);
  const [withSettings, setWithSettings] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const tail = crashLog.entries().slice(-8);

  const run = (label: string, fn: (r: crashLog.CrashReport) => Promise<string> | string, shot = withShot) => async () => {
    setBusy(label);
    setSaid(null);
    try {
      const report = await crashLog.buildReport({ note, screenshot: shot, settings: withSettings });
      setSaid(await fn(report));
      onDone();
    } catch (e) {
      setSaid(`Could not ${label.toLowerCase()}: ${(e as Error)?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const saveFile = run('Save file', (r) => {
    downloadText(`chromaglass-report-${stamp()}.json`, JSON.stringify(r, null, 2));
    return 'Saved.';
  });
  const saveShot = run('Save screenshot', (r) => {
    if (!r.screenshot) return 'There was no frame to save — the device may be gone.';
    const a = document.createElement('a');
    a.href = r.screenshot.dataUrl;
    a.download = `chromaglass-frame-${stamp()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return r.screenshot.painted ? 'Saved.' : 'Saved — but that frame was not painted, so it reads black.';
  }, true);
  const copyText = run('Copy text', async (r) => {
    // The picture does not go on a clipboard as text; everything else does.
    await navigator.clipboard.writeText(JSON.stringify({ ...r, screenshot: r.screenshot ? '[omitted]' : null }, null, 2));
    return 'Copied.';
  }, false);
  const send = run('Send', async (r) => {
    await crashLog.sendReport(r);
    return 'Sent. Thank you.';
  });

  return (
    <Sheet title="Report what happened" onClose={onClose} width={560} height={640} testId="crash-sheet">
      <div className="flex min-h-0 w-full flex-col gap-4 overflow-y-auto p-5">
        {fatal && (
          <p className="text-[13px] text-text-2">
            The plate stopped{fatal.load !== crashLog.loadId ? ' on the last load' : ''}: <span className="text-text">{fatal.msg.split('\n')[0]}</span>
          </p>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">What were you doing? (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="rounded-md border border-border bg-transparent p-2 text-[13px] text-text outline-none focus:border-border-strong"
            placeholder="Switched looks mid-song, then the projector went black…"
            data-testid="crash-note"
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">The last lines of the log</span>
          <pre className="max-h-44 overflow-auto rounded-md border border-border bg-black/40 p-2 text-[11px] leading-snug text-text-2" data-testid="crash-tail">
            {tail.length ? tail.map((e) => `${e.up.toFixed(1).padStart(7)}s ${e.level.padEnd(5)} ${e.source}: ${e.msg.split('\n')[0]}${e.repeats ? ` (×${e.repeats + 1})` : ''}`).join('\n') : 'Nothing logged.'}
          </pre>
        </div>
        <div className="flex flex-col gap-1 text-[13px] text-text-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={withShot} onChange={(e) => setWithShot(e.target.checked)} data-testid="crash-with-shot" /> Include a screenshot of the plate</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} data-testid="crash-with-settings" /> Include the look and its settings</label>
        </div>
        <p className="text-[12px] text-dim">
          Nothing is captured until you press a button. The report holds your note, this page's address, the browser and GPU, the show's state and log{withSettings ? ', the look' : ''}{withShot ? ', and a 960-pixel frame' : ''}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={saveFile} disabled={!!busy} testId="crash-save">{busy === 'Save file' ? 'Saving…' : 'Save file'}</Button>
          <Button onClick={saveShot} disabled={!!busy} testId="crash-save-shot">Save screenshot</Button>
          <Button onClick={copyText} disabled={!!busy} testId="crash-copy">Copy text</Button>
          {crashLog.REPORT_URL && <Button onClick={send} disabled={!!busy} testId="crash-send">{busy === 'Send' ? 'Sending…' : 'Send'}</Button>}
        </div>
        {said && <p className="text-[13px] text-text" data-testid="crash-said">{said}</p>}
      </div>
    </Sheet>
  );
}
