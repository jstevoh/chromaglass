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
  const updates = desktopUpdates();
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  useEffect(() => {
    if (!updates) return;
    let live = true;
    updates.state().then((s) => { if (live) setState(s); }).catch(() => {});
    const off = updates.onChange((s) => { if (live) setState(s); });
    return () => { live = false; off(); };
  }, [updates]);

  const row = macAppRow(tier, onMacComputer(), state, !!updates);
  return (
    <div data-cg-mac-app={row.kind} className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-neutral-400">Mac app</span>
        {row.kind === 'in-app' && row.current && <span className="font-mono text-[11px] text-neutral-400">{row.current}</span>}
      </div>
      {row.kind === 'download' && (
        <>
          <p className="mt-1.5 text-[11px] leading-snug text-neutral-400">
            The show offline, with the phone remote, OSC and the projector built in. For Macs with Apple silicon.
          </p>
          <a
            href={row.href}
            data-cg-mac-download=""
            className="mt-2 flex min-h-[38px] items-center justify-between rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-neutral-950 transition hover:bg-amber-400"
          >
            <span>Download for Mac</span>
            <span aria-hidden="true">↓</span>
          </a>
          <p className="mt-2 text-[11px] leading-snug text-neutral-500">
            Drag it into Applications. It tells you when a new version is out.
          </p>
        </>
      )}
      {row.kind === 'on-a-mac' && (
        <p className="mt-1.5 text-[11px] leading-snug text-neutral-400">
          Open chromaglass.art on your Mac and download it from Profile &amp; Store there.
        </p>
      )}
      {row.kind === 'with-pro' && (
        <p className="mt-1.5 text-[11px] leading-snug text-neutral-400">
          The Mac app comes with Pro: the show offline, with the phone remote, OSC and the projector built in.
        </p>
      )}
      {row.kind === 'in-app' && (
        <>
          <p className="mt-1.5 text-[11px] leading-snug text-neutral-400" data-cg-mac-update={state?.status ?? 'off'}>{row.line}</p>
          {row.button && (
            <button
              type="button"
              data-cg-mac-update-act=""
              onClick={() => { updates?.act().then(setState).catch(() => {}); }}
              className="mt-2 flex min-h-[36px] w-full items-center justify-center rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-neutral-100 transition hover:bg-white/10"
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
