import { CHECKOUT_MOIRE_URL, buildCheckoutUrl, hasLicensePack } from '../lib/tierGates';

/**
 * The moiré pack in the account sheet's store (PLAN.md 45a-2). The owner chose on
 * 2026-11-07 to sell it as an add-on to Home, $15 once, and to include it in Pro, so
 * what this shows hangs on the tier held here:
 * - Home without the pack: the Buy card. The checkout carries the account's email,
 *   because the store's order signs the Home key filed under that email again with the
 *   pack in it (server/license-packs.js); an order under another email is held.
 * - Home with the pack: one line that says so, so a buyer can see it arrived.
 * - Free: one line on where the pack comes from, since it cannot be bought alone.
 * - Pro: nothing (the store section is not drawn for Pro at all).
 *
 * Its own file beside AccountSheet.tsx, as the sheet's other cards are (CloudSyncCard,
 * MacAppCard). The sheet is the desk's and the phone's alike, so this is both.
 */
export function MoirePackBuy({ tier, email }: { tier: 'free' | 'home' | 'pro'; email: string | null | undefined }) {
  if (tier === 'pro') return null;
  if (tier === 'free') {
    return (
      <p data-cg-moire-pack="free" className="mt-2 text-[12px] leading-snug text-muted">
        The moiré pack, ten printed sheets for the stage and six looks, is $15 on top of Home, and in Pro.
      </p>
    );
  }
  if (hasLicensePack('moire')) {
    return (
      <p data-cg-moire-pack="owned" className="mt-2 text-[12px] leading-snug text-text-2">
        The moiré pack is on this licence.
      </p>
    );
  }
  if (!CHECKOUT_MOIRE_URL) return null;
  return (
    <a
      href={buildCheckoutUrl(CHECKOUT_MOIRE_URL, email)}
      target="_blank"
      rel="noopener noreferrer"
      data-cg-buy-moire=""
      className="mt-2 flex flex-col rounded-lg border border-border-strong bg-elevated p-3 text-left transition-colors hover:bg-hover"
    >
      <div className="flex items-center justify-between text-[13px] font-medium text-text">
        <span>Moiré pack</span>
        <span className="text-[12px] text-muted"><span className="font-mono font-medium text-text-2">$15</span> once</span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        Ten printed sheets for the stage and six looks: turn one over the other and the liquid draws itself into the fringes.
      </p>
    </a>
  );
}
