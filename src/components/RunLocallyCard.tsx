import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, X } from 'lucide-react';
import type { EngineStatus } from '../lib/platform';
import {
  CHECKOUT_PRO_URL,
  CHECKOUT_UPGRADE_URL,
  buildCheckoutUrl,
  getActiveLicenseInfo,
  getEffectiveTier,
  isTierGatingEnforced,
  openAccountSheet,
} from '../lib/tierGates';

const DISMISS_KEY = 'chromaglass-run-locally-dismissed';

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Shown once the quality governor has had to step down to hold the frame rate,
 * or the GPU solver is unavailable (PLAN.md §23.17). Suggests upgrading to
 * ChromaGlass Pro — which lets the automatic quality ladder climb to 768² at
 * 2x and 1024² at 1x, and on the web adds the Mac app with a window of its own
 * and the projector outputs — and stays hidden once a Pro licence is active.
 */
export function RunLocallyCard({ status }: { status: EngineStatus | null }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [licenseInfo, setLicenseInfo] = useState(getActiveLicenseInfo);

  useEffect(() => {
    const sync = () => setLicenseInfo(getActiveLicenseInfo());
    window.addEventListener('chromaglass:license-changed', sync);
    window.addEventListener('cg-license-changed', sync);
    return () => {
      window.removeEventListener('chromaglass:license-changed', sync);
      window.removeEventListener('cg-license-changed', sync);
    };
  }, []);

  if (!status || dismissed) return null;
  if (status.tier !== 'hosted' && !isTierGatingEnforced()) return null;
  if (!status.steppedDown && !status.gpuUnavailable) return null;
  // The tier the Account pill shows, not the licence alone: an ungated build is Pro too.
  if (getEffectiveTier() === 'pro') return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode */
    }
  };

  const isHome = licenseInfo.valid && licenseInfo.tier === 'home';
  const checkoutHref = buildCheckoutUrl(
    isHome ? CHECKOUT_UPGRADE_URL : CHECKOUT_PRO_URL,
    licenseInfo.email,
  );

  const reason = status.gpuUnavailable
    ? 'This browser can’t run the GPU solver at full speed.'
    : `The show stepped down to ${status.label.replace(/ · [\d.]+x$/, '')} to hold the frame rate.`;

  return (
    <motion.div
      data-cg-upgrade-pro-nudge
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="absolute bottom-20 left-1/2 z-20 w-[23rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-amber-400/25 bg-black/80 p-4 text-white shadow-2xl backdrop-blur-xl"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300/90">
          <Sparkles size={14} /> Upgrade to Pro
        </div>
        <button
          onClick={dismiss}
          className="text-white/40 hover:text-white/80"
          title="Dismiss"
          data-cg-upgrade-pro-close
        >
          <X size={14} />
        </button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-white/75">
        {reason} <strong className="font-semibold text-white">ChromaGlass Pro</strong> lets the
        automatic quality ladder climb to 768² at 2x and 1024² at 1x
        {status.tier === 'native'
          ? '.'
          : ', plus cloud sync of your looks, sets and MIDI map.'}
      </p>
      <div className="mb-3 flex items-center gap-2">
        <a
          href={checkoutHref}
          target="_blank"
          rel="noopener noreferrer"
          data-cg-upgrade-pro-cta
          className="flex-1 rounded-xl border border-amber-300/40 bg-amber-400/20 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-amber-100 hover:bg-amber-400/30"
        >
          {isHome ? 'Upgrade to Pro · $164' : 'Upgrade to Pro · $199'}
        </a>
        <button
          type="button"
          data-cg-upgrade-pro-account
          onClick={() => {
            dismiss();
            openAccountSheet();
          }}
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white/80 hover:bg-white/10 hover:text-white"
        >
          Profile &amp; Store
        </button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/45">
          One-time purchase · 2 machines per key
        </span>
        <button
          type="button"
          data-cg-upgrade-pro-dismiss
          onClick={dismiss}
          className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/60 hover:bg-white/10"
        >
          Not now
        </button>
      </div>
    </motion.div>
  );
}
