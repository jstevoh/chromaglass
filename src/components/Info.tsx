import { useState, type ReactNode } from 'react';
import { Info as InfoIcon } from 'lucide-react';

/**
 * The long explanation, folded away until it is asked for.
 *
 * Every one of these sections used to open with a paragraph. They are worth
 * keeping — several carry the one fact that stops a control being used wrongly,
 * like pointing the room camera at the floor rather than at the screen — but
 * together they were 722 words sitting permanently between a projectionist and
 * the sliders, and they are most of why the panel ran to eight screens. The
 * Room's was 198 words, directly above a fader someone wants during a song.
 *
 * So the prose stays and the ⓘ is how you ask for it.
 */
export function Info({ children, label = 'What this does' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={label ? '-mt-1 mb-2' : ''}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex min-h-[22px] min-w-[22px] items-center justify-center gap-1 rounded-md px-1 text-[11px] transition-colors ${label ? '-ml-1' : ''} ${
          open ? 'text-accent-text' : 'text-white/30 hover:text-white/70'
        }`}
        aria-expanded={open}
        aria-label={label || 'What this does'}
        data-info="toggle"
      >
        <InfoIcon size={12} />
        {/* No label where the ⓘ sits beside something that already names
            itself — a menu row, say. The glyph alone is the affordance. */}
        {label && <span>{label}</span>}
      </button>
      {open && (
        <p className="mt-1 max-w-[62ch] rounded-lg bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-white/60" data-info="body">
          {children}
        </p>
      )}
    </div>
  );
}
