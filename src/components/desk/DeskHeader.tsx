import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Segmented, StatusDot } from '../ui';
import { LOCKUP_URL, MARK_URL } from '../../brand';
import { AlphaBadge } from '../AlphaBadge';

/**
 * The bar across the top of both desks.
 *
 * One component rather than two copies because the status dots are the thing
 * you glance at when something has gone wrong — the projector dropped, the
 * controller was unplugged — and two copies drift. Design and Perform must
 * show the same truth in the same place.
 */

export type DeskMode = 'perform' | 'design' | 'sequence' | 'sound';

export interface DeskDots {
  sound: boolean;
  video: boolean;
  midi: boolean;
  
}

export function DeskHeader({ breadcrumb, mode, onMode, dots, midiName, onSound, onVideo, onMidi, onSearch, trailing }: {
  breadcrumb: ReactNode;
  mode: DeskMode;
  onMode: (m: DeskMode) => void;
  dots: DeskDots;
  midiName: string | null;
  /*
    Every dot opens the thing it reports on.

    A dot that says "Mic" and cannot be clicked is half a control. It is the
    one place on either desk where the state of an input is named, so it is
    where a hand goes when that input is the problem — and "which microphone
    is this?" has an answer the app already knows and a picker that was three
    clicks away through a menu that does not mention sound.
  */
  onMic?: () => void;
  onWall?: () => void;
  /** The controller panel. The dot is the only thing on either desk that names MIDI. */
  onMidi?: () => void;
  onPhone?: () => void;
  /** Start or stop a performance (T). */
  onPerformance?: () => void;
  onSearch: () => void;
  /** Design's Save and Send to wall; Perform has nothing here. */
  trailing?: ReactNode;
}) {
  /*
    Whether the status dots' words fit, measured rather than guessed.

    The mode switch is pinned to the header's centre, out of the flow, so it
    pushes nothing: the right-hand cluster runs underneath it once it is wider
    than the room to the right of the switch. How wide that is depends on the
    desk (Design adds Save and Send to wall), the controller's name and the
    window, so a breakpoint was always wrong somewhere: at 1400 the words came
    back and on Design, at about 1440, "Mic" was painted under "Songs"
    (reported, with a screenshot). The header measures instead: when the
    cluster would reach the switch, the words go and the dots stay; they come
    back when the cluster as it was with them fits again.
  */
  const headerRef = useRef<HTMLElement>(null);
  const switchRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const [tight, setTight] = useState(false);
  const wideW = useRef(0);
  useLayoutEffect(() => {
    const fit = () => {
      const h = headerRef.current, sw = switchRef.current, c = clusterRef.current;
      if (!h || !sw || !c) return;
      const hr = h.getBoundingClientRect(), sr = sw.getBoundingClientRect(), cr = c.getBoundingClientRect();
      const room = hr.right - 16 - sr.right - 12;
      if (!tight) {
        wideW.current = cr.width;
        if (cr.left < sr.right + 12) setTight(true);
      } else if (wideW.current + 4 < room) {
        setTight(false);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (headerRef.current) ro.observe(headerRef.current);
    if (clusterRef.current) ro.observe(clusterRef.current);
    return () => ro.disconnect();
  }, [tight]);

  return (
    /*
      Three columns, not `justify-between`.

      The mode switch has to sit in the same place in every mode, and with
      `justify-between` it did not: Design carries Save and Send to wall on the
      right and Perform carries nothing, so the middle group slid sideways by
      the width of two buttons the moment you switched — the one control whose
      whole job is to be in the same place every time was the one that moved
      when you used it.

      `minmax(0, 1fr)` on both sides rather than `1fr`: a plain fraction will
      not shrink below its content, so a long look name would have pushed the
      centre off true again. The sides can now give way, and the breadcrumb
      truncates instead.
    */
    <header ref={headerRef} className="relative col-span-3 flex items-center justify-between gap-4 border-b border-border px-4">
      <div className="flex min-w-0 max-w-[30%] items-center gap-2 text-[13px] font-medium">
        
        <button
          onClick={onSearch}
          className={`ml-1 inline-flex h-8 items-center gap-2 rounded-md border border-border-strong ${tight ? 'px-2' : 'px-3'} text-[13px] text-muted transition-colors hover:bg-hover hover:text-text`}
          data-testid="search-chip"
        >
          {/*
            The word goes before the dots do.

            At 1024 the right-hand cluster was still about twenty pixels too
            wide and the leftmost thing in it — the Mic dot — sat under the
            centred switch. "Search" is the most expendable word in the header:
            the shortcut beside it says what the button is, and ⌘K is the one
            convention every app this sits beside already uses.
          */}
          <span className="hidden xl:inline">Search </span>
          <span className="font-mono text-[11px] text-faint">⌘K</span>
        </button>
        {trailing}
      </div>
    </header>
  );
}
