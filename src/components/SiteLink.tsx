import { ExternalLink } from 'lucide-react';
import { isPhoneApp } from '../lib/appLink';

/**
 * The phone apps' pointer to the website (PLAN.md 12-promo-1).
 *
 * The owner asked on 2026-11-14 for "sufficient advertisements" in every app,
 * TV and phone, pointing at the website to "try more free chromaglass.art
 * visuals", and said not to point people at buying. So the words are about
 * the free visuals and nothing else: no price, no tier, no "buy", no
 * "upgrade". That also keeps the apps on the plain side of the stores' rules
 * on steering people to purchases outside the app, which a link that names a
 * price would not be.
 *
 * Only inside the iPhone and Android apps. On the website the reader is
 * already at chromaglass.art, and a link to the page they are on is noise.
 * In the app, a link to another host is opened by Capacitor in the system
 * browser (iOS: WebViewDelegationHandler opens any host that is not the
 * app's; Android: Bridge.launchIntent), because capacitor.config.json lists
 * no `allowNavigation` hosts: the site never replaces the app's own page.
 * `target="_blank"` says the same thing to a browser and is what Capacitor
 * reads for a new window.
 *
 * The TVs carry the same words beside a QR code (androidtv MainActivity's
 * siteCorner, tvos SiteCorner.swift), since a TV has no browser to open.
 */
export const SITE_URL = 'https://chromaglass.art';
export const SITE_WORDS = 'Try more free visuals at chromaglass.art';

/**
 * `bar`: one line of small text, for the app's mode bar over the remote.
 * `dark`: a full-width button on the app's own black screens (the laptop form).
 * `sheet`: the same button in the theme's colours, for the phone's More sheet.
 */
const LOOK = {
  bar: 'flex min-h-[44px] min-w-0 items-center gap-1.5 text-[11px] font-semibold text-white/70 underline-offset-2 active:underline',
  dark: 'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[13px] font-semibold text-white/85 active:bg-white/10',
  sheet: 'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-border-strong bg-elevated px-3 py-2 text-[13px] font-semibold text-text active:bg-active',
} as const;

export function SiteLink({ look }: { look: keyof typeof LOOK }) {
  if (!isPhoneApp()) return null;
  return (
    <a href={SITE_URL} target="_blank" rel="noopener" data-testid="app-site-link" className={LOOK[look]}>
      <ExternalLink size={look === 'bar' ? 12 : 14} className="shrink-0" />
      <span className="truncate">{SITE_WORDS}</span>
    </a>
  );
}
