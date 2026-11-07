import { useEffect, useState } from 'react';
import { Projector, X } from 'lucide-react';

/*
  The chip on the laptop that says the projector window is not filling its
  screen, so its title bar (the app's name, or the address) would sit across
  the top of the projection.

  It used to read "THE PROJECTOR WINDOW STILL HAS ITS TITLE BAR · fill its
  screen", and the owner, 2026-10-29, could neither make it go nor tell what
  it meant ("I can't get rid of this popup. I don't even know what it
  means."). Three things were wrong with it, and each is mended here or in
  what feeds it:

  - It could not be dismissed. A projector window left framed on purpose (a
    test on one screen, a wall that is a window on a second desktop) kept it
    over the top of the desk for the whole show. Now it has an X, and that
    holds for this projector window (`useCastSession`'s `fillDismissed`); a
    new window asks again.
  - It said what was so, not what was wrong or what the button did. Now it
    says the wall window is not full screen, so its title bar shows on the
    wall, and the button says "Make it full screen".
  - A click that did nothing said nothing. Now, if the window is still
    framed a moment after the click, it says what does work: a click on the
    wall window, or F pressed there (CastDisplay listens for both).

  It is gone the moment the window fills its screen: App only mounts it
  while `windowFullscreen` is false, and in the Mac app that read counts the
  window's own full screen, which used to leave it up over a window with no
  title bar at all.
*/

/** How long a click gets to take before the chip says what to try instead. */
const FILL_TAKES_MS = 1500;

export function ProjectorFillChip({ onFill, onDismiss }: { onFill: () => void; onDismiss: () => void }) {
  const [clickedAt, setClickedAt] = useState<number | null>(null);
  const [didNotTake, setDidNotTake] = useState(false);
  useEffect(() => {
    if (clickedAt === null) return;
    setDidNotTake(false);
    const timer = setTimeout(() => setDidNotTake(true), FILL_TAKES_MS);
    return () => clearTimeout(timer);
  }, [clickedAt]);
  return (
    <div className="fixed top-3 left-1/2 z-40 -translate-x-1/2 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-amber-400/30 bg-black/70 pl-4 pr-1.5 py-1.5 text-[12px] text-amber-100/90 backdrop-blur-xl shadow-2xl" data-testid="projector-fill" role="status">
      <Projector size={14} className="shrink-0" />
      <span className="truncate" data-testid="projector-fill-text">
        {didNotTake
          ? 'Still framed: click the wall window once, or press F on it'
          : "The wall window isn't full screen, so its title bar shows on the wall"}
      </span>
      <button
        onClick={() => { onFill(); setClickedAt(Date.now()); }}
        className="shrink-0 rounded-full border border-amber-400/40 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold hover:bg-amber-500/30"
        title="Put the wall window in full screen on its own screen, so nothing but the show is on the projector"
        data-testid="projector-fill-go"
      >
        Make it full screen
      </button>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded-full p-1.5 text-amber-100/50 hover:text-white"
        aria-label="Hide this"
        title="Hide this for this wall window (a new wall window asks again)"
        data-testid="projector-fill-dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
