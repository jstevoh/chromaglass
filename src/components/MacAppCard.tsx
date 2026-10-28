import React, { useEffect, useState } from 'react';
import { desktopUpdates, MAC_APP_NOTARISED, MAC_FIRST_OPEN, macAppRow, onMacComputer, type DesktopUpdateState } from '../lib/macApp';

/**
 * The Mac app in Profile & Store (PLAN.md 13-update). On the site it is the
 * download, for Home and Pro on a Mac; on a phone or a PC it says where to get
 * it, and to anyone on neither that it comes with them. Inside the app it is the app's
 * own version and what its updater found, with the one button the menu item
 * also gives (desktop/updates.js), so an update is found where the performer
 * already looks for their account, not only in the menu bar.
 */
export const MacAppCard: React.FC<{ tier: string }> = ({ tier }) => {
  // Read once: the bridge is fixed for the page's life, and the effect below
  // subscribes to it once rather than on every render.
  const [updates] = useState(desktopUpdates);
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  useEffect(() => {
    if (!updates) return;
    let live = true;
    updates.state().then((s) => { if (live) setState(s); }).catch(() => {});
    const off = updates.onChange((s) => { if (live) setState(s); });
    return () => { live = false; off(); };
  }, [updates]);

  const row = macAppRow(tier, onMacComputer(), state, !!updates);
  // The sheet's own classes (AccountSheet, CloudSyncCard), so the card reads as one of its sections.
  const label = 'text-[11px] font-medium uppercase tracking-wider text-dim';
  const note = 'mt-1 text-[12px] leading-snug text-muted';
  const what = 'The show offline, with the phone remote and the projector built in.';
  return (
    <div data-cg-mac-app={row.kind} className="border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <div className={label}>Mac app</div>
        {row.kind === 'in-app' && row.current && <span className="font-mono text-[11px] text-dim">{row.current}</span>}
      </div>
      {row.kind === 'download' && (
        <>
          <p className="mt-1 text-[12px] leading-snug text-text-2">{what} For Macs with Apple silicon.</p>
          <a
            href={row.href}
            data-cg-mac-download=""
            className="mt-2 flex min-h-10 pointer-coarse:min-h-12 w-full items-center justify-between rounded-lg border border-accent-border bg-accent-bg px-3 text-[13px] font-medium text-text transition-colors hover:bg-accent/30"
          >
            <span>Download for Mac</span>
            <span className="text-accent-text" aria-hidden="true">↓</span>
          </a>
          <p className={note}>Drag it into Applications. It tells you when a new version is out.</p>
          {!MAC_APP_NOTARISED && <p className={note} data-cg-mac-first-open="">{MAC_FIRST_OPEN}</p>}
        </>
      )}
      {row.kind === 'on-a-mac' && <p className={note}>Open chromaglass.art on your Mac and download it from this sheet there.</p>}
      {row.kind === 'with-a-licence' && <p className={note}>The Mac app comes with Home and Pro. {what}</p>}
      {row.kind === 'in-app' && (
        <>
          <p className="mt-1 text-[13px] text-text" data-cg-mac-update={state?.status ?? 'off'} aria-live="polite">{row.line}</p>
          {row.progress !== null && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={row.progress}
              aria-label="Update download"
              data-cg-mac-update-progress={row.progress}
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border"
            >
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${row.progress}%` }} />
            </div>
          )}
          {row.notes && row.button && (
            <div data-cg-mac-update-notes="" className="mt-2">
              <div className={label}>New in {state?.version}</div>
              <ul className="mt-1 list-disc pl-4 text-[12px] leading-snug text-text-2">
                {row.notes.split('\n').map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}
          {row.button && (
            <button
              type="button"
              data-cg-mac-update-act=""
              onClick={() => { updates?.act().then(setState).catch(() => {}); }}
              className="mt-2 flex min-h-10 pointer-coarse:min-h-12 items-center justify-center rounded-lg border border-border-strong px-3 text-[13px] font-medium text-text-2 transition-colors hover:bg-hover"
            >
              {row.button}
            </button>
          )}
          <div className="mt-3">
            <div className={label} id="cg-mac-update-mode-label">Updates</div>
            <div role="radiogroup" aria-labelledby="cg-mac-update-mode-label" data-cg-mac-update-mode={row.mode} className="mt-1 grid grid-cols-2 gap-1">
              {([['auto', 'Automatic'], ['manual', 'Ask me first']] as const).map(([mode, name]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={row.mode === mode}
                  data-cg-mac-update-set={mode}
                  onClick={() => { updates?.setMode(mode).then(setState).catch(() => {}); }}
                  className={`min-h-9 pointer-coarse:min-h-12 rounded-lg border px-2 text-[12px] font-medium transition-colors ${row.mode === mode ? 'border-accent-border bg-accent-bg text-text' : 'border-border text-text-2 hover:bg-hover'}`}
                >
                  {name}
                </button>
              ))}
            </div>
            <p className={note}>
              {row.mode === 'auto'
                ? 'New versions download in the background and install when you quit ChromaGlass, or sooner with Restart to Update.'
                : 'ChromaGlass only looks. A new version shows what is in it, and downloads when you click Download and Install.'}
            </p>
            {row.modeNote && <p className={note} data-cg-mac-update-unsigned="">{row.modeNote}</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default MacAppCard;
