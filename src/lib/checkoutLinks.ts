/**
 * Where "Buy" goes: Lemon Squeezy's live-mode checkouts (the store was approved on
 * 2026-10-29), kept apart from tierGates.ts because that file pulls in the sign-in flag and
 * the licence reader, and the landing page (PLAN.md 34a) is a chunk that must carry neither
 * Firebase nor the engine. The account sheet and the landing page read the same links.
 */

// Lemon Squeezy's live-mode products (store approved 2026-10-29): Home 1479217, Upgrade 1479218,
// Pro 1479219. The test-mode links these replace opened a checkout that charged nothing.
export const CHECKOUT_HOME_URL =
  'https://chromaglass.lemonsqueezy.com/checkout/buy/87144c33-66fc-4a34-bb34-d85cd023901d';
export const CHECKOUT_PRO_URL =
  'https://chromaglass.lemonsqueezy.com/checkout/buy/39f941ed-fc84-45b4-b188-2049f14def50';
export const CHECKOUT_UPGRADE_URL =
  'https://chromaglass.lemonsqueezy.com/checkout/buy/0271d431-a839-4a31-8778-4028525563cd';

export function buildCheckoutUrl(baseUrl: string, email?: string | null): string {
  const clean = email?.trim();
  if (!clean || !clean.includes('@')) return baseUrl;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}checkout[email]=${encodeURIComponent(clean)}`;
}
