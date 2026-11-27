/**
 * Making your own is Pro: the one gate and the one upsell for every "make your
 * own" designer (PLAN.md 23.19).
 *
 * The owner asked, 2026-10-31, that only Pro users make their own liquids, and
 * Lens Type (PLAN.md 31f) is planned the same way: everyone plays every
 * built-in bottle and lens, Pro makes new ones. So the gate is not written
 * into the liquid designer. A designer asks `useCanMakeOwn()` whether its
 * Design and Edit controls are open, and where they would be on Free and Home
 * it shows `<ProMakerUpsell>` with its own line of copy. A second designer
 * (custom lens types) takes both and writes nothing new about tiers.
 *
 * What a non-Pro user already has stays theirs. Liquids saved before this gate,
 * a show kit's bottles and a Pro key that lapsed all leave bottles on the
 * shelf, and pulling them would break a saved look or a set mid-show. So the
 * gate closes making, changing and loading: picking, pouring, saving to a file
 * and taking a bottle off the shelf stay open on every tier. Loading a file is
 * closed with making because a `.liquids.json` is a few lines anyone can write
 * by hand, so an open Load would be an open Design; Lens Type's plan (31f-5)
 * gates importing the same way. The site gates are a nudge anyway: the source
 * is public and anyone can run it unlocked (PLAN.md §23).
 *
 * The tier is `getEffectiveTier()` (tierGates.ts), the one answer the Account
 * pill and every other Pro gate read (23.17c), so a build that gates nothing
 * (a local show, the checks) is Pro and keeps every designer open. It is read
 * again on the licence events the Account sheet sends, so typing a Pro key
 * opens the designer without reopening Settings.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  buildCheckoutUrl, CHECKOUT_PRO_URL, CHECKOUT_UPGRADE_URL, getActiveLicenseInfo, getEffectiveTier, type EffectiveTier,
} from '../lib/tierGates';
import { TierLockBadge, openTierLock } from './TierLock';

const LICENCE_EVENTS = ['chromaglass:license-changed', 'cg-license-changed'] as const;

/** The tier now, read again whenever a licence is added or removed. */
export function useEffectiveTier(): EffectiveTier {
  const [tier, setTier] = useState<EffectiveTier>(getEffectiveTier);
  useEffect(() => {
    const sync = () => setTier(getEffectiveTier());
    for (const e of LICENCE_EVENTS) window.addEventListener(e, sync);
    return () => { for (const e of LICENCE_EVENTS) window.removeEventListener(e, sync); };
  }, []);
  return tier;
}

/** Whether this machine may make and change its own (liquids, lens types): Pro only. */
export function useCanMakeOwn(): boolean {
  return useEffectiveTier() === 'pro';
}

/**
 * Where a designer's Design button would be on Free and Home: what Pro adds,
 * the button that buys it (the upgrade price on a Home key) and the page that
 * says what else Pro has. `what` is the heading ("Make your own liquids"),
 * `children` the one line of what it does.
 */
export function ProMakerUpsell({ id, what, children }: { id: string; what: string; children: ReactNode }) {
  const tier = useEffectiveTier();
  if (tier === 'pro') return null;
  const email = getActiveLicenseInfo().email;
  return (
    <div data-cg-pro-upsell={id} className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5 mb-3 text-[12px] text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-amber-200">{what}</span>
        <TierLockBadge label="Pro" />
      </div>
      <p className="text-[12px] text-amber-100/90 leading-snug mt-1">Unlocked by ChromaGlass Pro. {children}</p>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <a href={buildCheckoutUrl(tier === 'home' ? CHECKOUT_UPGRADE_URL : CHECKOUT_PRO_URL, email)}
          target="_blank" rel="noreferrer" data-cg-pro-upsell-buy
          className="inline-flex min-h-7 pointer-coarse:min-h-11 items-center rounded-full border border-amber-400/40 bg-amber-400/20 px-3 text-[12px] font-medium text-amber-100 hover:bg-amber-400/30">
          {tier === 'home' ? 'Upgrade to Pro' : 'Get Pro'}
        </a>
        <button
          type="button"
          onClick={() => openTierLock(id === 'liquids' ? 'liquids' : 'pro-io', { itemName: what })}
          className="inline-flex min-h-7 pointer-coarse:min-h-11 items-center rounded-full bg-white/10 px-3 text-[12px] font-medium text-white/90 hover:bg-white/20"
        >
          See unlock options →
        </button>
      </div>
    </div>
  );
}
