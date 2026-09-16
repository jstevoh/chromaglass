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

export function DeskHeader({ breadcrumb, mode, onMode, dots, midiName, onSearch, trailing }: {
  breadcrumb: ReactNode;
  mode: DeskMode;
  onMode: (m: DeskMode) => void;
  dots: DeskDots;
  midiName: string | null;
  onSearch: () => void;
  /** Design's Save and Send to wall; Perform has nothing here. */
  trailing?: ReactNode;
}) {
  return (
    <header className="col-span-3 flex items-center justify-between gap-4 border-b border-border px-4">
      <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium">{breadcrumb}</div>
      <Segmented
        value={mode}
        options={[['perform', 'Perform'], ['design', 'Design'], ['sequence', 'Sequence']] as const}
        onChange={onMode}
        height={32}
        testId="mode-segmented"
      />
      <div className="flex shrink-0 items-center gap-3">
        <StatusDot on={dots.mic} label="Mic" testId="dot-mic" />
        <StatusDot on={dots.wall} label="Wall" testId="dot-wall" />
        <StatusDot on={dots.midi} label={midiName ?? 'MIDI'} testId="dot-midi" />
        <StatusDot on={dots.phone} label="Phone" testId="dot-phone" />
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
