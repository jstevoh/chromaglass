import React, { useEffect, useState } from 'react';
import { desktopUpdates, macAppRow, onMacComputer, type DesktopUpdateState } from '../lib/macApp';

/**
 * The Mac app in Profile & Store (PLAN.md 13-update). On the site it is the
 * download, for Pro on a Mac; on a phone or a PC it says where to get it, and
 * to anyone not on Pro that it comes with Pro. Inside the app it is the app's
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
  const what = 'The show offline, with the phone remote, OSC and the projector built in.';
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
        </>
      )}
      {row.kind === 'on-a-mac' && <p className={note}>Open chromaglass.art on your Mac and download it from this sheet there.</p>}
      {row.kind === 'with-pro' && <p className={note}>The Mac app comes with Pro. {what}</p>}
      {row.kind === 'in-app' && (
        <>
          <p className="mt-1 text-[13px] text-text" data-cg-mac-update={state?.status ?? 'off'} aria-live="polite">{row.line}</p>
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
        </>
      )}
    </div>
  );
};

export default MacAppCard;
