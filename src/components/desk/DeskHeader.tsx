import type { ReactNode } from 'react';
import { Segmented, StatusDot } from '../ui';

/**
 * The bar across the top of both desks.
 *
 * One component rather than two copies because the status dots are the thing
 * you glance at when something has gone wrong — the projector dropped, the
 * controller was unplugged — and two copies drift. Design and Perform must
 * show the same truth in the same place.
 */

export type DeskMode = 'perform' | 'design' | 'sequence';

export interface DeskDots {
  mic: boolean;
  wall: boolean;
  midi: boolean;
  phone: boolean;
  rec: string | null;
}

export function DeskHeader({ breadcrumb, mode, onMode, dots, midiName, onMic, onWall, onMidi, onPhone, onSearch, trailing }: {
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
  onSearch: () => void;
  /** Design's Save and Send to wall; Perform has nothing here. */
  trailing?: ReactNode;
}) {
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
    <header className="relative col-span-3 flex items-center justify-between gap-4 border-b border-border px-4">
      <div className="flex min-w-0 max-w-[30%] items-center gap-2 text-[13px] font-medium">{breadcrumb}</div>
      {/*
        Out of the flow, so it is centred on the *header* rather than on
        whatever happens to be either side of it. Three columns did pin it, but
        only by letting the sides give way — and at 1440 the right-hand cluster
        needs more room than half of what is left, so Design's status dots were
        clipped. Taking the switch out of the flow centres it exactly and leaves
        the sides their natural width.
      */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="pointer-events-auto">
          <Segmented
            value={mode}
            options={[['perform', 'Perform'], ['design', 'Design'], ['sequence', 'Sequence']] as const}
            onChange={onMode}
            height={32}
            testId="mode-segmented"
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
        <StatusDot
          on={dots.mic}
          label="Mic"
          onClick={onMic}
          title={dots.mic ? 'Sound is coming in — click to choose the input' : 'Nothing is listening. Click to pick a microphone or another source.'}
          testId="dot-mic"
        />
        <StatusDot
          on={dots.wall}
          label="Wall"
          onClick={onWall}
          title={dots.wall ? 'On a wall — click for the output controls' : 'Not on a wall. Click for the projector and output controls.'}
          testId="dot-wall"
        />
        <StatusDot
          on={dots.midi}
          label={midiName ?? 'MIDI'}
          onClick={onMidi}
          title={dots.midi ? `${midiName ?? 'MIDI'} — open the controller panel` : 'No controller. Click to set one up.'}
          testId="dot-midi"
        />
        <StatusDot
          on={dots.phone}
          label="Phone"
          onClick={onPhone}
          title={dots.phone ? 'A phone is driving the show — click to read what it can do' : 'No phone. Click to see how to connect one.'}
          testId="dot-phone"
        />
        {dots.rec && <StatusDot on tone="live" label={`Rec ${dots.rec}`} testId="dot-rec" />}
        <button
          onClick={onSearch}
          className="ml-1 inline-flex h-8 items-center gap-2 rounded-md border border-border-strong px-3 text-[13px] text-muted transition-colors hover:bg-hover hover:text-text"
          data-testid="search-chip"
        >
          Search <span className="font-mono text-[11px] text-faint">⌘K</span>
        </button>
        {trailing}
      </div>
    </header>
  );
}
