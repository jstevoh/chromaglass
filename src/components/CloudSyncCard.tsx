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
      return `Up to date${s.at ? `, ${ago(s.at)}` : ''}.${what ? ` The cloud holds ${what}.` : ''}`;
    }
    case 'offline':
      return `Can't reach the cloud. Everything stays here${s.waiting ? ` (${s.waiting} change${s.waiting === 1 ? '' : 's'} waiting)` : ''} and goes up when it's back.`;
    case 'not-pro':
      return `No Pro key is filed under ${email ?? 'this account'}. Sync follows the Pro key bought with the address you sign in with.`;
    case 'full': return 'The cloud copy is full. Delete some saved looks you no longer use, then sync again.';
    default: return 'Sync stopped on an error. It will try again.';
  }
}

export const CloudSyncCard: React.FC<{ tier: 'free' | 'home' | 'pro'; email: string | null }> = ({ tier, email }) => {
  const status = useCloudSyncStatus();
  const [on, setOn] = useState(() => cloudSync()?.isOn() ?? false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!cloudSyncBuilt()) return null;

  const btn = 'min-h-[44px] rounded-xl border px-3.5 py-2 text-sm font-medium transition';
  const quiet = `${btn} border-white/15 bg-white/10 text-neutral-100 hover:bg-white/15`;

  if (tier !== 'pro') {
    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3" data-cg-cloud-sync="upsell">
        <div className="text-xs uppercase tracking-wider text-neutral-500">Cloud sync · Pro</div>
        <p className="mt-1 text-xs text-neutral-400">
          Pro keeps your saved looks, sequences, set lists, song shows, MIDI map and settings the same in every
          browser and Mac app you sign in to.
        </p>
        <a
          href={buildCheckoutUrl(tier === 'home' ? CHECKOUT_UPGRADE_URL : CHECKOUT_PRO_URL, email)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-amber-300 hover:text-amber-200"
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
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3" data-cg-cloud-sync={status?.state ?? 'idle'}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-neutral-500">Cloud sync</div>
        <div className="flex gap-1" role="group" aria-label="Cloud sync on this computer">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={on === v}
              data-testid={v ? 'cloud-sync-on' : 'cloud-sync-off'}
              onClick={() => toggle(v)}
              className={`min-h-[44px] min-w-[52px] rounded-lg px-3 text-sm font-medium transition ${
                on === v ? 'bg-amber-400 text-neutral-950' : 'bg-white/10 text-neutral-300 hover:bg-white/15'
              }`}
            >
              {v ? 'On' : 'Off'}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-neutral-300" data-testid="cloud-sync-status" aria-live="polite">
        {note ?? line(status, email)}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        Saved looks, sequences, set lists, song shows, liquids, the MIDI map and settings. The projector layout,
        audio input and MIDI ports stay with each computer.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {on && (
          <button type="button" className={quiet} data-testid="cloud-sync-now" onClick={() => { setNote(null); void cloudSync()?.sync(true); }}>
            Sync now
          </button>
        )}
        {!confirmErase ? (
          <button type="button" className={`${btn} border-white/10 bg-transparent text-neutral-400 hover:text-neutral-200`} onClick={() => setConfirmErase(true)}>
            Erase the cloud copy
          </button>
        ) : (
          <div className="w-full rounded-lg border border-red-500/30 bg-red-950/40 p-2.5">
            <p className="text-xs text-red-200">
              This removes what the cloud holds. Every computer keeps its own copy. Turn sync off on the others
              first, or they fill the cloud again.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={`${btn} border-red-400/40 bg-red-500/20 text-red-100 hover:bg-red-500/30`}
                data-testid="cloud-sync-erase"
                onClick={async () => {
                  const ok = await cloudSync()?.erase();
                  setConfirmErase(false);
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
