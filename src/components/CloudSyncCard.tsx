import React, { useState } from 'react';
import { cloudSync, cloudSyncBuilt, useCloudSyncStatus } from '../lib/cloudSyncApp';
import { buildCheckoutUrl, CHECKOUT_PRO_URL, CHECKOUT_UPGRADE_URL } from '../lib/tierGates';
import type { SyncStatus } from '../lib/cloudSync';

/**
 * Cloud sync in the profile sheet (PLAN.md 23.18), on the desk and on the phone
 * alike: the sheet is one component, laid out for each (#430), so this card is
 * written to sit in a phone-width column as well as the desk's.
 *
 * It says what the cloud holds and when it last answered, in the player's words
 * (looks, sets), and what it does not carry, because the one thing a player
 * would otherwise expect and not find is the projector's layout, which belongs
 * to each machine and the room it is in.
 */

const ago = (at: number | null): string => {
  if (!at) return '';
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
};

const held = (counts: Record<string, number>): string => {
  const parts: string[] = [];
  const n = (k: string) => counts[k] ?? 0;
  if (n('presets')) parts.push(`${n('presets')} saved look${n('presets') === 1 ? '' : 's'}`);
  if (n('sequences')) parts.push(`${n('sequences')} sequence${n('sequences') === 1 ? '' : 's'}`);
  if (n('sets')) parts.push(`${n('sets')} saved set${n('sets') === 1 ? '' : 's'}`);
  if (n('songShows')) parts.push(`${n('songShows')} song show${n('songShows') === 1 ? '' : 's'}`);
  if (n('liquids')) parts.push(`${n('liquids')} liquid${n('liquids') === 1 ? '' : 's'}`);
  return parts.join(', ');
};

function line(s: SyncStatus | null, email: string | null): string {
  if (!s) return '';
  switch (s.state) {
    case 'off': return 'Off on this computer. Nothing is sent or brought in.';
    case 'idle': return 'Starting…';
    case 'syncing': return 'Syncing…';
    case 'synced': {
      const what = held(s.counts);
      const big = s.refused ? ` ${s.refused} item${s.refused === 1 ? ' is' : 's are'} too large to sync and stay${s.refused === 1 ? 's' : ''} on this computer.` : '';
      return `Up to date${s.at ? `, ${ago(s.at)}` : ''}.${what ? ` The cloud holds ${what}.` : ''}${big}`;
    }
    case 'offline':
      return `Can't reach the cloud. Everything stays here${s.waiting ? ` (${s.waiting} change${s.waiting === 1 ? '' : 's'} waiting)` : ''} and goes up when it's back.`;
    case 'not-pro':
      return `No Pro key is filed under ${email ?? 'this account'}. Sync follows the Pro key bought with the address you sign in with.`;
    case 'full': return 'The cloud copy is full. Delete some saved looks you no longer use, then sync again.';
    case 'erased': return 'The cloud copy was erased from another computer. This one fills it again within the hour unless you turn sync off here.';
    default: return 'Sync stopped on an error. It will try again.';
  }
}

export const CloudSyncCard: React.FC<{ tier: 'free' | 'home' | 'pro'; email: string | null }> = ({ tier, email }) => {
  const status = useCloudSyncStatus();
  const [on, setOn] = useState(() => cloudSync()?.isOn() ?? false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!cloudSyncBuilt()) return null;

  // The sheet's own tokens and sizes (AccountSheet.tsx `label`, `section`, `ghostBtn`), so the
  // card reads as part of it on the desk and keeps the phone's 48 px targets.
  const label = 'text-[11px] font-medium uppercase tracking-wider text-dim';
  const section = 'border-t border-border pt-4';
  const quiet = 'flex min-h-10 pointer-coarse:min-h-12 items-center justify-center rounded-lg border border-border-strong px-3 text-[13px] font-medium text-text-2 transition-colors hover:bg-hover disabled:opacity-50';
  const textBtn = 'min-h-10 pointer-coarse:min-h-12 text-[12px] text-muted underline decoration-faint underline-offset-2 hover:text-text';

  if (tier !== 'pro') {
    return (
      <div className={section} data-cg-cloud-sync="upsell">
        <div className={label}>Cloud sync · Pro</div>
        <p className="mt-1 text-[12px] leading-snug text-text-2">
          Pro keeps your saved looks, sequences, set lists, song shows, MIDI map, desk tabs and settings the same in every
          browser and Mac app you sign in to.
        </p>
        <a
          href={buildCheckoutUrl(tier === 'home' ? CHECKOUT_UPGRADE_URL : CHECKOUT_PRO_URL, email)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex min-h-10 pointer-coarse:min-h-12 items-center text-[13px] font-medium text-accent-text hover:text-text"
        >
          {tier === 'home' ? 'Upgrade to Pro' : 'Get Pro'}
        </a>
      </div>
    );
  }

  const toggle = (next: boolean) => {
    const e = cloudSync();
    if (!e) return;
    e.setOn(next);
    setOn(next);
    setNote(null);
    if (next) void e.sync(true);
  };

  return (
    <div className={section} data-cg-cloud-sync={status?.state ?? 'idle'}>
      <div className="flex items-center justify-between gap-2">
        <div className={label}>Cloud sync</div>
        <div className="flex gap-1" role="group" aria-label="Cloud sync on this computer">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={on === v}
              data-testid={v ? 'cloud-sync-on' : 'cloud-sync-off'}
              onClick={() => toggle(v)}
              className={`min-h-10 pointer-coarse:min-h-12 min-w-[52px] rounded-lg border px-3 text-[13px] font-medium transition-colors ${
                on === v ? 'border-accent-border bg-accent-bg text-text' : 'border-border-strong text-text-2 hover:bg-hover'
              }`}
            >
              {v ? 'On' : 'Off'}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[13px] text-text" data-testid="cloud-sync-status" aria-live="polite">
        {note ?? line(status, email)}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        Saved looks, sequences, set lists, song shows, liquids, the MIDI map, the desk's tabs and settings. The projector layout,
        audio input and MIDI ports stay with each computer.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {on && (
          <button type="button" className={quiet} data-testid="cloud-sync-now" onClick={() => { setNote(null); void cloudSync()?.sync(true); }}>
            Sync now
          </button>
        )}
        {!confirmErase ? (
          <button type="button" className={textBtn} onClick={() => setConfirmErase(true)}>
            Erase the cloud copy
          </button>
        ) : (
          <div className="w-full rounded-lg border border-border-strong bg-elevated p-3">
            <p className="text-[12px] leading-snug text-text-2">
              This removes what the cloud holds and turns sync off on this computer. Every computer keeps its
              own copy. Turn sync off on the others too, or they fill the cloud again once they next sign in.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={quiet}
                data-testid="cloud-sync-erase"
                onClick={async () => {
                  const ok = await cloudSync()?.erase();
                  setConfirmErase(false);
                  if (ok) setOn(false);
                  setNote(ok ? 'The cloud copy is erased.' : "Couldn't reach the cloud to erase it. Try again when you're online.");
                }}
              >
                Erase
              </button>
              <button type="button" className={quiet} onClick={() => setConfirmErase(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudSyncCard;
