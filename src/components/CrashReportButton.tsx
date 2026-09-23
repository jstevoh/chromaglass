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
 */

const SEEN = 'chromaglass-crash-seen';
const readSeen = () => { try { return Number(localStorage.getItem(SEEN) ?? 0); } catch { return 0; } };
const markSeen = (t: number) => { try { localStorage.setItem(SEEN, String(t)); } catch { /* private window */ } };

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export function CrashReportButton({ onlyWhenLit = false }: {
  /** The desk's header has no room: there, it appears only when there is something to report. */
  onlyWhenLit?: boolean;
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

  const acknowledge = useCallback(() => {
    if (fatal) markSeen(fatal.t);
    setChip(false);
  }, [fatal]);

  const lit = fatal !== null && chip;
  if (onlyWhenLit && !lit && !open) return null;

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
      {lit && !open && (
        <div
          className="absolute right-0 top-full mt-2 flex items-center gap-2 whitespace-nowrap rounded-full border border-amber-400/40 bg-[#0b0b10]/95 py-1.5 pl-3 pr-1.5 text-[12px] text-white/90 shadow-2xl backdrop-blur-xl pointer-events-auto"
          style={{ animation: 'chromaglass-menu-in 0.15s ease-out' }}
          data-testid="crash-chip"
        >
          <span>The plate stopped — save a report?</span>
          <button onClick={() => { setOpen(true); setChip(false); }} className="rounded-full bg-amber-500 px-2.5 py-0.5 font-medium text-black hover:bg-amber-400">Report</button>
          <button onClick={acknowledge} className="rounded-full px-2 py-0.5 text-white/50 hover:text-white" aria-label="Dismiss">✕</button>
        </div>
      )}
      {open && createPortal(
        <ReportSheet fatal={fatal} onClose={() => setOpen(false)} onDone={acknowledge} />,
        document.body,
      )}
    </div>
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
            {tail.length ? tail.map((e) => `${e.up.toFixed(1).padStart(7)}s ${e.level.padEnd(5)} ${e.source}: ${e.msg.split('\n')[0]}`).join('\n') : 'Nothing logged.'}
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
