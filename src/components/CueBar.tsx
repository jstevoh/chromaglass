import { motion } from 'motion/react';
import { Play, X, Undo2, Timer } from 'lucide-react';
import { FADE_CHOICES } from '../lib/lookFade';

/**
 * The armed look, and the button that sends it.
 *
 * A light-show desk has preview and program: you see what you are about to do
 * before the room does. This app had only program — clicking a preset put it
 * on the wall that instant, through a path that clears the plate first, so
 * every change of look was a hard cut through near-black in front of a room.
 *
 * So a look can be *cued* instead. Nothing reaches the stage until Go, and Go
 * crossfades: the new dyes are adopted onto the plate that is already there
 * and the settings walk across over a few seconds. `npm run desk` drives the
 * fade and checks the stage never sags — measured over all 992 pairs of
 * presets, it does not, while the clearing path drops to 2%.
 *
 * Revert is here rather than in a menu because the fastest fix mid-show is
 * undo, and a menu is not fast.
 */
interface CueBarProps {
  /** The armed look, or null when nothing is waiting. */
  cued: { id: string; name: string } | null;
  /** What is on the stage now. */
  liveName: string | null;
  /** 0 while nothing is fading, else how far through. */
  fading: number;
  fadeSeconds: number;
  onFadeSeconds: (s: number) => void;
  onGo: () => void;
  onCancel: () => void;
  /** Absent when there is nothing to go back to. */
  onRevert: (() => void) | null;
}

export function CueBar({ cued, liveName, fading, fadeSeconds, onFadeSeconds, onGo, onCancel, onRevert }: CueBarProps) {
  const busy = fading > 0;
  if (!cued && !busy && !onRevert) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-2xl border border-white/15 bg-black/80 px-3 py-2.5 backdrop-blur-xl shadow-2xl text-white"
      data-testid="cue-bar"
    >
      {/* What is live, and what is waiting behind it. */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">On stage</span>
          <span className="text-[12px] font-semibold max-w-[11rem] truncate" data-testid="cue-live">{liveName ?? '—'}</span>
        </div>
        {cued && (
          <>
            <span className="text-white/25">→</span>
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-[0.2em] text-amber-300/70">Cued</span>
              <span className="text-[12px] font-semibold max-w-[11rem] truncate text-amber-200" data-testid="cue-armed">{cued.name}</span>
            </div>
          </>
        )}
      </div>

      {/* How long the crossfade takes. */}
      <label className="flex items-center gap-1.5 text-[10px] text-white/50" title="How long Go takes">
        <Timer size={13} />
        <select
          value={fadeSeconds}
          onChange={e => onFadeSeconds(Number(e.target.value))}
          className="bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-white/40"
          data-testid="cue-fade"
          aria-label="Crossfade time"
        >
          {FADE_CHOICES.map(s => <option key={s} value={s}>{s === 0 ? 'cut' : `${s}s`}</option>)}
        </select>
      </label>

      {cued && (
        <button
          onClick={onCancel}
          className="p-2.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          title="Take the cued look off the stack"
          aria-label="Cancel the cued look"
          data-testid="cue-cancel"
        >
          <X size={16} />
        </button>
      )}

      <button
        onClick={onGo}
        disabled={!cued || busy}
        className="relative flex items-center gap-2 overflow-hidden rounded-xl bg-white px-5 py-2.5 text-[12px] font-bold uppercase tracking-widest text-black transition-opacity disabled:opacity-25"
        title="Send the cued look to the stage"
        data-testid="cue-go"
      >
        {/* The fade, drawn: a desk should show how far through it is. */}
        {busy && <span className="absolute inset-y-0 left-0 bg-amber-300" style={{ width: `${fading * 100}%` }} />}
        <span className="relative flex items-center gap-2"><Play size={14} /> Go</span>
      </button>

      {onRevert && (
        <button
          onClick={onRevert}
          disabled={busy}
          className="p-2.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-25"
          title="Back to the look before the last Go"
          aria-label="Revert to the previous look"
          data-testid="cue-revert"
        >
          <Undo2 size={16} />
        </button>
      )}
    </motion.div>
  );
}
