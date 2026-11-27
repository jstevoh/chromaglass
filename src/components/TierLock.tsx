import { useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { openAccountSheet } from '../lib/tierGates';

/**
 * One lock language across the desk, Settings and the phone (PLAN 49j / H9-03).
 *
 * Locked features used to wear four different disguises: a silent "Pack" pill
 * in LooksGrid that jumped straight to Account with no hint of why, an amber
 * banner in Record and Render, a bordered "Try for a minute" box in Moiré
 * Settings, and unbadged look tiles on the phone. Every locked feature now
 * carries the same `TierLockBadge`, uses the same `TierLockBanner` callout,
 * and opens the same sheet (`AccountSheet` with `useTierLock()`) explaining
 * which tier unlocks it.
 *
 * Kept inside `src/components/` rather than changing `openAccountSheet()` in
 * `src/lib/tierGates.ts`, so no cross-domain export changes shape.
 */
export type TierLockFeatureId =
  | 'moire'
  | 'full-record'
  | 'full-render'
  | 'custom-logo'
  | 'live-show'
  | 'liquids'
  | 'grid-1024'
  | 'song-id'
  | 'phone-remote'
  | 'multi-projector'
  | 'pro-io';

export interface TierLockSpec {
  badge: string;
  title: string;
  unlocks: string;
  summary: string;
}

export const TIER_LOCK_SPECS: Record<TierLockFeatureId, TierLockSpec> = {
  moire: {
    badge: 'Pro · Pack',
    title: 'Moiré pack',
    unlocks: 'Included in ChromaGlass Pro, or a $15 add-on for Home.',
    summary: 'Ten printed sheets for the stage and seven moiré looks where the liquid bends the fringes.',
  },
  'full-record': {
    badge: 'Home · Pro',
    title: 'Full-length unmarked Record',
    unlocks: 'Unlocked by ChromaGlass Home or Pro.',
    summary: 'Record full sets with no 15-second clip cap and no ChromaGlass corner mark.',
  },
  'full-render': {
    badge: 'Home · Pro',
    title: '1080p & 4K unmarked Render',
    unlocks: 'Unlocked by ChromaGlass Home or Pro.',
    summary: 'Render songs offline at 1080p and 4K with no ChromaGlass corner mark.',
  },
  'custom-logo': {
    badge: 'Home · Pro',
    title: 'Custom band logo & text layer',
    unlocks: 'Unlocked by ChromaGlass Home or Pro.',
    summary: 'Put your own band mark or transparent PNG on the glass instead of the ChromaGlass mark.',
  },
  'live-show': {
    badge: 'Home · Pro',
    title: 'Live Show streaming',
    unlocks: 'Unlocked by ChromaGlass Home or Pro in the Mac app.',
    summary: 'Stream the show directly to YouTube, Twitch, Facebook and custom RTMP destinations.',
  },
  liquids: {
    badge: 'Pro',
    title: 'Make your own liquids',
    unlocks: 'Unlocked by ChromaGlass Pro.',
    summary: 'Design custom liquids with your own viscosity, surface tension and optical look, and load .liquids.json files.',
  },
  'grid-1024': {
    badge: 'Pro',
    title: '1024² grid & GPU headroom',
    unlocks: 'Unlocked by ChromaGlass Pro.',
    summary: 'Climb the automatic quality ladder to 768² at 2x and 1024² at 1x, and pin the 1024² grid.',
  },
  'song-id': {
    badge: 'Home · Pro',
    title: 'Song ID & timed lyrics',
    unlocks: 'Unlocked by ChromaGlass Home or Pro in the Mac app.',
    summary: 'Recognise the music playing in the room and run each song’s show automatically.',
  },
  'phone-remote': {
    badge: 'Home · Pro',
    title: 'Phone remote & network stage',
    unlocks: 'Unlocked by ChromaGlass Home or Pro in the Mac app.',
    summary: 'Drive the plate from your phone over Venue Wi-Fi with zero cloud lag.',
  },
  'multi-projector': {
    badge: 'Pro',
    title: '1024² grid & cloud sync',
    unlocks: 'Unlocked by ChromaGlass Pro.',
    summary: 'The finest fluid grid plus cloud sync of your looks, sets and MIDI map across browsers.',
  },
  'pro-io': {
    badge: 'Pro',
    title: 'OSC & Art-Net / DMX',
    unlocks: 'Unlocked by ChromaGlass Pro in the Mac app.',
    summary: 'Drive the show from Resolume, TouchDesigner or lighting desks, and send plate colour to DMX fixtures.',
  },
};

export interface ActiveTierLock {
  feature: TierLockFeatureId;
  itemName?: string;
}

const LOCK_EVENT = 'cg-tier-lock-change';
let activeLock: ActiveTierLock | null = null;

/** Open the one unlock/account sheet focused on a specific locked feature. */
export function openTierLock(feature: TierLockFeatureId, opts?: { itemName?: string }): void {
  activeLock = { feature, itemName: opts?.itemName };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOCK_EVENT));
  }
  openAccountSheet();
}

export function clearTierLock(): void {
  if (!activeLock) return;
  activeLock = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOCK_EVENT));
  }
}

export function useTierLock(): ActiveTierLock | null {
  const [lock, setLock] = useState<ActiveTierLock | null>(() => activeLock);
  useEffect(() => {
    const sync = () => setLock(activeLock);
    window.addEventListener(LOCK_EVENT, sync);
    return () => window.removeEventListener(LOCK_EVENT, sync);
  }, []);
  return lock;
}

/** The single lock badge used wherever a feature, look or option is gated. */
export function TierLockBadge({ label, className = '', testId = 'tier-lock-badge' }: { label: string; className?: string; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/35 bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-200 ${className}`}
    >
      <Lock size={10} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

/**
 * The single lock banner used in panels, settings sections and phone sheets.
 * Every locked feature presents the same badge, plain tier explanation and
 * unlock action leading to the one Account/Unlock sheet.
 */
export function TierLockBanner({
  feature,
  title,
  summary,
  badge,
  actionLabel,
  onAction,
  secondaryAction,
  touch = false,
  className = '',
  dataAttrs,
}: {
  feature: TierLockFeatureId;
  title?: string;
  summary?: ReactNode;
  badge?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: ReactNode;
  touch?: boolean;
  className?: string;
  dataAttrs?: Record<string, string | undefined>;
}) {
  const spec = TIER_LOCK_SPECS[feature];
  const handleUnlock = onAction ?? (() => openTierLock(feature));
  return (
    <div
      className={`rounded-lg border border-amber-500/30 bg-amber-500/[0.08] p-3 text-[12px] leading-relaxed text-amber-100 ${className}`}
      {...dataAttrs}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-amber-200">{title ?? spec.title}</span>
        <TierLockBadge label={badge ?? spec.badge} />
      </div>
      <p className="mt-1 text-amber-100/90">{summary ?? `${spec.unlocks} ${spec.summary}`}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleUnlock}
          data-testid={`tier-lock-open-${feature}`}
          className={`inline-flex items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/20 px-3 font-medium text-amber-100 transition-colors hover:bg-amber-400/30 ${
            touch ? 'min-h-11 text-[13px]' : 'min-h-7 text-[11px]'
          }`}
        >
          {actionLabel ?? 'See unlock options →'}
        </button>
        {secondaryAction}
      </div>
    </div>
  );
}
