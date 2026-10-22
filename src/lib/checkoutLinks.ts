/**
 * The store's checkout links, on their own so the landing page can carry the
 * Buy buttons without pulling in the tier gates (and the sign-in code behind
 * them). `tierGates.ts` re-exports these; the account sheet still imports them
 * from there.
 */

export const CHECKOUT_HOME_URL =
  'https://chromaglass.lemonsqueezy.com/checkout/buy/e4ac2797-90f4-413a-b423-d9b73b41cdaa';
export const CHECKOUT_PRO_URL =
  'https://chromaglass.lemonsqueezy.com/checkout/buy/08ac3a98-9a0b-4630-ab3f-fef720ca215c';
export const CHECKOUT_UPGRADE_URL =
  'https://chromaglass.lemonsqueezy.com/checkout/buy/4f942048-d8c3-473a-a5ce-4622e28af245';

export function buildCheckoutUrl(baseUrl: string, email?: string | null): string {
  const clean = email?.trim();
  if (!clean || !clean.includes('@')) return baseUrl;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}checkout[email]=${encodeURIComponent(clean)}`;
}
