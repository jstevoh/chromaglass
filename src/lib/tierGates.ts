/**
 * Tier & license feature gates for the free website, ChromaGlass Home, and
 * ChromaGlass Pro (PLAN.md 23.2, 23.4, 23.5, 23.6, 23.11).
 *
 * The hosted site (`VITE_FIREBASE_HOSTED_SITE=1`) and an enforced desktop launch
 * (`CHROMAGLASS_ENFORCE_TIERS=1` / `CHROMAGLASS_REQUIRE_SIGNIN=1`) gate paid
 * features by the active Ed25519 license key (`free` -> `home` -> `pro`).
 * Default local builds without those flags remain unrestricted (`pro`) so
 * existing local development and automated checks run unchanged.
 */

import { isSignedInCached } from './authFlag';
import { getCachedLicenseStatus, type LicenseTier } from './licenseKey';

export type EffectiveTier = 'free' | 'home' | 'pro';

export interface NativeLicenseBridge {
  valid?: boolean;
  tier?: EffectiveTier;
  email?: string | null;
  id?: string | null;
  exp?: number | null;
  error?: string | null;
  enforced?: boolean;
}

interface NativeBridgeWindow {
  __CHROMAGLASS_NATIVE__?: {
    shell?: string;
    platform?: string;
    requireSignIn?: boolean;
    license?: NativeLicenseBridge;
  };
}

export const FREE_RECORD_MAX_SECONDS = 15;
export const FREE_RENDER_MAX_HEIGHT = 720;
export const FREE_SITE_LOGO_TEXT = 'ChromaGlass';

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

export function openAccountSheet(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cg-open-account'));
  }
}

const MARKETING_OPTIN_KEY = 'chromaglass-marketing-optin';
const MARKETING_OPTIN_AT_KEY = 'chromaglass-marketing-optin-at';

export function getMarketingOptIn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MARKETING_OPTIN_KEY) === '1';
  } catch {
    return false;
  }
}

export function hasExplicitMarketingChoice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = localStorage.getItem(MARKETING_OPTIN_KEY);
    return v === '1' || v === '0';
  } catch {
    return false;
  }
}

export function setMarketingOptIn(optIn: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MARKETING_OPTIN_KEY, optIn ? '1' : '0');
    localStorage.setItem(MARKETING_OPTIN_AT_KEY, new Date().toISOString());
    window.dispatchEvent(new CustomEvent('cg-marketing-changed', { detail: { optIn } }));
  } catch {
    // storage unavailable
  }
}

export async function syncMarketingPreferenceToServer(
  idToken: string,
  optIn: boolean,
): Promise<void> {
  const licensesUrl = import.meta.env.VITE_FIREBASE_LICENSES_URL as string | undefined;
  if (!licensesUrl || !idToken) return;
  try {
    const base = licensesUrl.replace(/\/keys\/?$/, '');
    await fetch(`${base}/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ marketingOptIn: optIn }),
    });
  } catch {
    // non-fatal network error
  }
}

export interface AppTileSpec {
  id: string;
  title: string;
  tier: LicenseTier;
  summary: string;
}

export const APP_FEATURE_TILES: AppTileSpec[] = [
  {
    id: 'song-id',
    title: 'Song ID & timed lyrics',
    tier: 'home',
    summary: 'In the ChromaGlass app — identifies the room’s music and steps through the song’s look script.',
  },
  {
    id: 'phone-remote',
    title: 'Phone remote & network stage',
    tier: 'home',
    summary: 'In the ChromaGlass app — drive the plate from your phone over Venue Wi-Fi with zero cloud lag.',
  },
  {
    id: 'full-record',
    title: 'Full-length unmarked Record',
    tier: 'home',
    summary: 'In the ChromaGlass app — record full sets with no 15-second clip cap and no corner mark.',
  },
  {
    id: 'full-render',
    title: '1080p & 4K unmarked Render',
    tier: 'home',
    summary: 'In the ChromaGlass app — offline song bounce at 1080p and 4K with no ChromaGlass mark.',
  },
  {
    id: 'custom-logo',
    title: 'Custom band logo & text layer',
    tier: 'home',
    summary: 'In the ChromaGlass app — put your own band mark or SVG on the glass instead of the ChromaGlass mark.',
  },
  {
    id: 'multi-projector',
    title: 'Multi-projector & edge blend',
    tier: 'pro',
    summary: 'In the ChromaGlass app (Pro) — span multiple projectors with feathered overlap.',
  },
  {
    id: 'pro-io',
    title: 'OSC, Art-Net / DMX & MIDI Out',
    tier: 'pro',
    summary: 'In the ChromaGlass app (Pro) — lock into lighting desks, Resolume, TouchDesigner and house rigs.',
  },
];

function getNativeBridge() {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as NativeBridgeWindow).__CHROMAGLASS_NATIVE__;
}

export function isHostedSiteBuild(): boolean {
  if (import.meta.env?.VITE_FIREBASE_HOSTED_SITE === '1' || import.meta.env?.VITE_FIREBASE_HOSTED_SITE === 'true') {
    return true;
  }
  if (typeof window !== 'undefined') {
    try {
      const q = new URLSearchParams(window.location.search).get('tierGates');
      if (q === '1' || q === 'true') return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export function isTierGatingEnforced(): boolean {
  if (isHostedSiteBuild()) return true;
  // The site as built for the Mac app (desktop.yml), in a browser opened on the
  // app's own server: Home's and Pro's features by the key, as in the app's
  // window (PLAN.md 23.17d), not everything because no shell said so.
  if (import.meta.env?.VITE_MAC_APP === '1') return true;
  const native = getNativeBridge();
  return Boolean(native?.license?.enforced || native?.requireSignIn);
}

export function getActiveLicenseInfo(): {
  valid: boolean;
  tier: EffectiveTier;
  email: string | null;
  id: string | null;
  error: string | null;
} {
  const cached = getCachedLicenseStatus();
  if (cached.valid && cached.tier) {
    return {
      valid: true,
      tier: cached.tier,
      email: cached.email,
      id: cached.id,
      error: null,
    };
  }
  const nativeLic = getNativeBridge()?.license;
  if (nativeLic?.valid && (nativeLic.tier === 'home' || nativeLic.tier === 'pro')) {
    return {
      valid: true,
      tier: nativeLic.tier,
      email: nativeLic.email ?? null,
      id: nativeLic.id ?? null,
      error: null,
    };
  }
  return {
    valid: false,
    tier: 'free',
    email: null,
    id: null,
    error: nativeLic?.error ?? cached.error ?? null,
  };
}

export function getEffectiveTier(): EffectiveTier {
  const lic = getActiveLicenseInfo();
  if (lic.valid) return lic.tier;
  if (isTierGatingEnforced()) return 'free';
  return 'pro';
}

export function isFreeTierGated(): boolean {
  return getEffectiveTier() === 'free';
}

export function canUseHomeFeature(): boolean {
  const t = getEffectiveTier();
  return t === 'home' || t === 'pro';
}

export function canUseProFeature(): boolean {
  return getEffectiveTier() === 'pro';
}

/**
 * Whether the desktop sign-in gate should appear (PLAN 23.11):
 * Only when `requireSignIn` is enabled on the native app, no valid license key
 * is present, and the user has not signed in. A valid license key NEVER hits
 * a sign-in gate, even with the network off.
 */
export function shouldShowSignInGate(): boolean {
  const native = getNativeBridge();
  let forceGate = Boolean(native?.requireSignIn);
  if (!forceGate && typeof window !== 'undefined') {
    try {
      forceGate = new URLSearchParams(window.location.search).get('requireSignIn') === '1';
    } catch {
      // ignore
    }
  }
  if (!forceGate) return false;
  if (getActiveLicenseInfo().valid) return false;
  if (isSignedInCached()) return false;
  return true;
}

/**
 * Draw the subtle ChromaGlass corner mark onto a 2D canvas context for
 * free-tier recordings and renders (PLAN 23.5).
 */
export function drawChromaGlassWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.save();
  const fontSize = Math.max(12, Math.round(height * 0.024));
  const padX = Math.max(14, Math.round(width * 0.02));
  const padY = Math.max(12, Math.round(height * 0.022));
  ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'right';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
  ctx.fillText(FREE_SITE_LOGO_TEXT, width - padX, height - padY);
  ctx.restore();
}
