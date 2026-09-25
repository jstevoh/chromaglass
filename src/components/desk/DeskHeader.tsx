import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Segmented, StatusDot } from '../ui';
import { LOCKUP_URL, MARK_URL } from '../../brand';

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
  mic: boolean;
  wall: boolean;
  midi: boolean;
  phone: boolean;
  rec: string | null;
  /** The performance being recorded, as its clock ("1:23"), or null. */
  perf: string | null;
}

export function DeskHeader({ breadcrumb, mode, onMode, dots, midiName, onMic, onWall, onMidi, onPhone, onPerformance, onSearch, trailing }: {
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
        {/*
          The name where there is room for it, the mark alone where there is
          not. Below 1280 this side is already giving way to the centred mode
          switch (see below), and what it has room for belongs to the
          breadcrumb — the look that is up is what someone reads here.
        */}
        <img src={LOCKUP_URL} alt="ChromaGlass" className="hidden h-7 w-auto shrink-0 xl:block" draggable={false} />
        <img src={MARK_URL} alt="ChromaGlass" className="h-7 w-7 shrink-0 xl:hidden" draggable={false} />
        <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        {breadcrumb}
      </div>
      {/*
        Out of the flow, so it is centred on the *header* rather than on
        whatever happens to be either side of it. Three columns did pin it, but
        only by letting the sides give way — and at 1440 the right-hand cluster
        needs more room than half of what is left, so Design's status dots were
        clipped. Taking the switch out of the flow centres it exactly and leaves
        the sides their natural width.
      */}
      {/*
        Centred out of the flow only while there is room for it.

        Taking the switch out of the flow centres it exactly, and at 1440 that
        is right. But out of the flow it also stops pushing anything, so as the
        window narrows the right-hand cluster slides straight underneath it —
        measured at 1024, a laptop width: the switch was painted on top of the
        Mic, Wall and MIDI dots. Those dots became clickable recently, so
        reaching for Mic there did not merely miss, it switched the desk to
        Design.

        Putting it back into the flow below a width fixes the overlap and
        brings back the thing taking it out of the flow was for: in the flow
        its position depends on the two sides, so switching Perform to Design
        — which adds Save and Send to wall on the right — slides it sideways,
        and the one control whose job is to be in the same place every time
        moves when you use it. Measured at 1280 it was still overlapping
        anyway, because 1280 is not where it stops fitting.

        So it stays pinned, and the *labels* on the status dots give way
        instead. See `StatusDot`: they are most of the right-hand cluster's
        width, and a dot without its word is still a dot you can see, click
        and hover.
      */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div ref={switchRef} className="pointer-events-auto">
          <Segmented
            value={mode}
            options={[['perform', 'Perform'], ['design', 'Design'], ['sound', 'Sound']] as const}
            onChange={onMode}
            height={32}
            testId="mode-segmented"
          />
        </div>
      </div>
      <div ref={clusterRef} className="flex shrink-0 items-center gap-3 whitespace-nowrap">
        <StatusDot
          on={dots.mic}
          label="Mic" tight={tight}
          onClick={onMic}
          title={dots.mic ? 'Sound is coming in — click to choose the input' : 'Nothing is listening. Click to pick a microphone or another source.'}
          testId="dot-mic"
        />
        <StatusDot
          on={dots.wall}
          label="Wall" tight={tight}
          onClick={onWall}
          title={dots.wall ? 'On a wall — click for the output controls' : 'Not on a wall. Click for the projector and output controls.'}
          testId="dot-wall"
        />
        <StatusDot
          on={dots.midi}
          label={midiName ?? 'MIDI'} tight={tight}
          onClick={onMidi}
          title={dots.midi ? `${midiName ?? 'MIDI'} — open the controller panel` : 'No controller. Click to set one up.'}
          testId="dot-midi"
        />
        <StatusDot
          on={dots.phone}
          label="Phone" tight={tight}
          onClick={onPhone}
          title={dots.phone ? 'A phone is driving the show — click to read what it can do' : 'No phone. Click to see how to connect one.'}
          testId="dot-phone"
        />
        {dots.rec && <StatusDot on tone="live" label={`Rec ${dots.rec}`} tight={tight} testId="dot-rec" />}
        {/*
          Performances start and stop here, by hand (T). They used to follow
          the song detection, which started late and ran on into the next
          song; the song that is playing is still attached, on its own.
          Bare, with the clock in its tooltip: a label here pushed Mic and
          Wall under the centred mode switch at 1440 (npm run qa).
        */}
        <StatusDot
          bare
          on={!!dots.perf}
          tone="live"
          label={dots.perf ? `Performance ${dots.perf}` : 'Performance'}
          onClick={onPerformance}
          title={dots.perf
            ? `Recording a performance (${dots.perf}). Click or press T to stop and keep it, with the song that is playing.`
            : 'Start recording a performance: what you paint, replayable later at the same moments in the song. Click or press T.'}
          testId="dot-performance"
        />
        <button
          onClick={onSearch}
          className="ml-1 inline-flex h-8 items-center gap-2 rounded-md border border-border-strong px-3 text-[13px] text-muted transition-colors hover:bg-hover hover:text-text"
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
