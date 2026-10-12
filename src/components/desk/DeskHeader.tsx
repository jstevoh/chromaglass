import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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

/*
  The switch's values are the old desks' names, so everything that still asks
  which desk is up (`deskMode` in App, the checks that click
  `mode-segmented-perform`) keeps its meaning: `design` is the Build layout,
  `perform` is Gig, and `loadin` is new.
*/
export type DeskMode = 'perform' | 'design' | 'loadin' | 'sequence' | 'sound';

export interface DeskDots {
  sound?: boolean;
  video?: boolean;
  mic?: boolean;
  wall?: boolean;
  midi: boolean;
  phone?: boolean;
  rec?: string | null;
  /** The performance being recorded, as its clock ("1:23"), or null. */
  perf?: string | null;
}

export function DeskHeader({ breadcrumb, mode, onMode, dots, midiName, onSound, onVideo, onWall, onMidi, onPhone, onRecord, onPerformance, onSearch, leading, trailing }: {
  breadcrumb: ReactNode;
  mode: DeskMode;
  onMode: (m: DeskMode) => void;
  dots: DeskDots;
  midiName: string | null;
  /*
    Every dot opens the thing it reports on.

    A dot that says "Sound" and cannot be clicked is half a control. It is the
    one place on either desk where the state of an input is named, so it is
    where a hand goes when that input is the problem — and "which microphone
    is this?" has an answer the app already knows and a picker that was three
    clicks away through a menu that does not mention sound.
  */
  onSound?: () => void;
  onVideo?: () => void;
  onWall?: () => void;
  /** The controller panel. The dot is the only thing on either desk that names MIDI. */
  onMidi?: () => void;
  onPhone?: () => void;
  /** Start, stop or manage canvas video recording. */
  onRecord?: () => void;
  /** Start or stop a performance (T). */
  onPerformance?: () => void;
  onSearch: () => void;
  /** Before the dots: the desk's + Panel. */
  leading?: ReactNode;
  /** After the search chip: Blackout, the one action the header carries in every layout. */
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
  /*
    And when even the words under the dots do not fit, the dots fold into one
    (PLAN.md 8h). At 1024 the cluster (+ Panel, six dots with their words
    under them, search and Blackout) measured 342 px against 337 of room
    right of the switch, so the Sound dot sat 5 px under it; any seventh thing
    (a controller with a long name, a phone linked while recording) ran it
    further under. Folded, one Status button stands for all of them: its dot
    is red while anything is recording, green while anything is connected,
    and it opens the dots as they were, each still opening what it reports on.

    Three levels, each measured rather than guessed: 0 the words beside the
    dots, 1 the words under them, 2 folded. The words go under at 12 px from
    the switch, as they always did; the dots fold only when the cluster
    actually reaches it, so a width where the words-under fit with a few
    pixels to spare (1280) keeps every dot in sight. A level comes back down
    only when the cluster as it was at the level below fits again, so it
    cannot flicker between two.
  */
  const [level, setLevel] = useState<0 | 1 | 2>(0);
  /*
    What each level saves, measured at the moment it was taken: the width
    just before, less the width just after. Coming back down asks whether
    today's cluster plus that saving fits, not whether the cluster as it was
    then fits: what made it too wide (a Rec dot, a long controller name) may
    have gone since, and the header should unfold when it has.
  */
  const saved = useRef<[number, number, number]>([0, 0, 0]);
  const before = useRef<{ from: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const h = headerRef.current, sw = switchRef.current, c = clusterRef.current;
      if (!h || !sw || !c) return;
      const hr = h.getBoundingClientRect(), sr = sw.getBoundingClientRect(), cr = c.getBoundingClientRect();
      // How close the cluster may come to the switch at each level before the next.
      const margin = (l: number) => (l === 0 ? 12 : 0);
      if (before.current && before.current.from === level - 1) {
        saved.current[level] = Math.max(0, before.current.w - cr.width);
        before.current = null;
      }
      if (level < 2 && cr.left < sr.right + margin(level)) {
        before.current = { from: level, w: cr.width };
        setLevel((level + 1) as 1 | 2);
        return;
      }
      if (level > 0 && cr.width + saved.current[level] + 4 < hr.right - 16 - sr.right - margin(level - 1)) setLevel((level - 1) as 0 | 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (headerRef.current) ro.observe(headerRef.current);
    if (clusterRef.current) ro.observe(clusterRef.current);
    return () => ro.disconnect();
  }, [level]);
  /*
    But folded, the dots are inside the Status button, so the cluster is the
    button's width whatever they are: a Rec dot going away when the take
    stops, or a long controller name giving way to a short one, changes
    nothing the observer sees, and the saving measured with them in it would
    hold the header folded until the window grew by a dot. So when the set of
    dots changes the header starts again from the words beside the dots and
    measures its way back up; this runs before paint, so where it still has to
    fold it folds without a frame shown unfolded. Recording is a dot or none,
    not its clock: the clock ticks every second and would re-measure with it.
  */
  const dotSet = `${!!onWall}|${!!onPhone}|${!!dots.rec}|${midiName ?? ''}`;
  const lastSet = useRef(dotSet);
  useLayoutEffect(() => {
    if (lastSet.current === dotSet) return;
    lastSet.current = dotSet;
    saved.current = [0, 0, 0];
    before.current = null;
    setLevel(0);
  }, [dotSet]);
  const tight = level >= 1;
  const folded = level === 2;
  const [openDots, setOpenDots] = useState(false);
  const foldRef = useRef<HTMLDivElement>(null);
  // A list left open when the header unfolded must not come back by itself when it folds again.
  useEffect(() => { if (!folded) setOpenDots(false); }, [folded]);
  useEffect(() => {
    if (!folded || !openDots) return;
    const away = (e: PointerEvent) => { if (!foldRef.current?.contains(e.target as Node)) setOpenDots(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenDots(false); };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key); };
  }, [folded, openDots]);

  /** Every dot, beside one another in the bar or down the folded list. */
  const dotsAt = (t: boolean) => (
    <>
      <StatusDot
        on={dots.sound ?? dots.mic ?? false}
        label="Sound" tight={t}
        onClick={onSound}
        title={(dots.sound ?? dots.mic) ? 'Sound is coming in — click to choose the input' : 'Nothing is listening. Click to pick a microphone or another source.'}
        testId="dot-sound"
      />
      <StatusDot
        on={!!dots.video}
        label="Video" tight={t}
        onClick={onVideo}
        title={dots.video ? 'Video is playing — click to pick a different video' : 'Click to pick a video file'}
        testId="dot-video"
      />
      {onWall && (
        <StatusDot
          on={!!dots.wall}
          label="Wall" tight={t}
          onClick={onWall}
          title={dots.wall ? 'On a wall — click for the output controls' : 'Not on a wall. Click for the projector and output controls.'}
          testId="dot-wall"
        />
      )}
      <StatusDot
        on={dots.midi}
        label={midiName ?? 'MIDI'} short="MIDI" tight={t}
        onClick={onMidi}
        title={dots.midi ? `${midiName ?? 'MIDI'} — open the controller panel` : 'No controller. Click to set one up.'}
        testId="dot-midi"
      />
      {onPhone && (
        <StatusDot
          on={!!dots.phone}
          label="Phone" tight={t}
          onClick={onPhone}
          title={dots.phone ? 'A phone is driving the show — click to read what it can do' : 'No phone. Click to see how to connect one.'}
          testId="dot-phone"
        />
      )}
      {dots.rec && (
        <StatusDot
          on
          tone="live"
          label={`Rec ${dots.rec}`}
          short="Rec"
          tight={t}
          onClick={onRecord}
          title={`Recording canvas video (${dots.rec}). Click to manage recording options or press R to stop.`}
          testId="dot-rec"
        />
      )}
      {/*
        Performances start and stop here, by hand (T). They used to follow
        the song detection, which started late and ran on into the next
        song; the song that is playing is still attached, on its own.
        A short word, with the clock in its tooltip: "Performance 0:42"
        beside it pushed Mic and Wall under the centred mode switch at 1440
        (npm run qa), and with no word at all nobody could tell what it was.
      */}
      <StatusDot
        on={!!dots.perf}
        tone="live"
        label="Perf" tight={t}
        onClick={onPerformance}
        title={dots.perf
          ? `Recording a performance (${dots.perf}). Click or press T to stop and keep it, with the song that is playing.`
          : 'Start recording a performance: what you paint, replayable later at the same moments in the song. Click or press T.'}
        testId="dot-performance"
      />
    </>
  );
  const recording = !!dots.rec || !!dots.perf;
  const connected = [dots.sound ?? dots.mic, dots.video, dots.wall, dots.midi, dots.phone].filter(Boolean).length;

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
    <header ref={headerRef} className="relative col-[1/-1] flex items-center justify-between gap-4 border-b border-border px-4">
      <div className="flex min-w-0 max-w-[30%] items-center gap-2 text-[13px] font-medium">
        {/*
          The name where there is room for it, the mark alone where there is
          not. Below 1280 this side is already giving way to the centred mode
          switch (see below), and what it has room for belongs to the
          breadcrumb — the look that is up is what someone reads here.
        */}
        <img src={LOCKUP_URL} alt="ChromaGlass" className="hidden h-7 w-auto shrink-0 xl:block" draggable={false} />
        <img src={MARK_URL} alt="ChromaGlass" className="h-7 w-7 shrink-0 xl:hidden" draggable={false} />
        <AlphaBadge />
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

        So it stays pinned, and the *labels* on the status dots make room
        instead: they move under their dots, small (see `StatusDot`). They
        used to go altogether, and a row of unlabelled dots was reported as
        impossible to read.
      */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div ref={switchRef} className="pointer-events-auto">
          {/*
            The layouts of the one desk, then the two screens of their own
            (Desk v2). Sound stays, after Sequence: it is the only way to the
            music player and the drone, and the design's switch has no other
            door to them.
          */}
          <Segmented
            value={mode}
            options={[['design', 'Build'], ['perform', 'Gig'], ['loadin', 'Load-in'], ['sequence', 'Sequence'], ['sound', 'Sound']] as const}
            onChange={onMode}
            height={32}
            divideBefore="sequence"
            tight
            testId="mode-segmented"
          />
        </div>
      </div>
      <div ref={clusterRef} className={`flex shrink-0 items-center whitespace-nowrap ${tight ? 'gap-1.5' : 'gap-3'}`} data-testid="header-cluster" data-fold={level}>
        {leading}
        {folded ? (
          <div ref={foldRef} className="relative">
            <button
              onClick={() => setOpenDots(v => !v)}
              className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-[12px] text-text-2 transition-colors hover:bg-hover"
              title={`${connected} connected${recording ? ', recording' : ''}. Click for each one.`}
              aria-expanded={openDots}
              data-testid="dot-fold"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: recording ? 'var(--color-live)' : connected > 0 ? 'var(--color-ok)' : 'var(--color-knob-off)' }}
              />
              Status
            </button>
            {openDots && (
              <div
                className="absolute right-0 top-full z-40 mt-1 flex flex-col items-start gap-1 rounded-md border border-border-strong bg-elevated p-2 shadow-lg"
                data-testid="dot-fold-list"
              >
                {dotsAt(false)}
              </div>
            )}
          </div>
        ) : dotsAt(tight)}
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
