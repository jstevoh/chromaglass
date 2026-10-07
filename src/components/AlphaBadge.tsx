/**
 * "Alpha", beside the name wherever the name is drawn.
 *
 * The owner asked for it (2026-10-06): ChromaGlass is in alpha, and someone
 * opening it should know that before they plan a night on it. So it sits next
 * to the lockup on the laptop's desks, on the top card a phone or a narrow
 * window shows, and on the phone remote, and not on the plate itself, which
 * goes up on a wall in front of a room.
 *
 * Text, not a picture, so a screen reader says it with the name. 11px bold
 * capitals, the floor `npm run layout` holds the desks' text to for a dark
 * room. It is not a control, so the 24px hit-target rule does not apply.
 * It never shrinks: one short word, and a label cut to "Al…" is worse than
 * none. On the desk, the breadcrumb beside it gives way instead, as it already
 * does for the lockup.
 *
 * Marked with `data-alpha-badge` rather than a test id: the desk header and
 * the top card can both be in the page at once (one hidden), and `layout`
 * counts a test id found twice as a control drawn twice.
 */
export function AlphaBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded border border-amber-300/40 bg-amber-300/10 px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none tracking-widest text-amber-200 ${className}`}
      data-alpha-badge=""
    >
      Alpha
    </span>
  );
}
