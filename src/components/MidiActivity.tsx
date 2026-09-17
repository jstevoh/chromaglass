import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { subscribeAllTouches, type TouchEvent } from '../lib/midiTouch';
import { ACTION_LABELS, type MidiAction } from '../lib/midi';
import { PIN_RANGE } from '../lib/deskPins';
import { PALETTE } from '../constants';

/**
 * What the controller is doing, in words, without the controls being on screen.
 *
 * The desk shows six rides and a cue list because that is what a hand is on
 * between songs — but a controller can reach ninety settings, and the other
 * eighty-four change with nothing on screen to say so. Riding Refraction from
 * a knob meant either putting Refraction on the strip, which costs one of the
 * six, or riding it blind.
 *
 * So this is a running list of what was just changed and where it landed. It
 * is not a control surface: nothing here can be clicked except the button that
 * hides it, because a thing that reports the controller should never be a
 * second place to argue with it.
 *
 * ## Why it buffers
 *
 * A fader sweep is a hundred messages a second. Setting React state on each
 * one would re-render this list a hundred times a second to show a number
 * nobody can read at that rate. Events land in a ref and the list is rebuilt
 * ten times a second, which is well past the eye and a tenth of the work.
 */

/** How long a line stays after the last time it moved. */
const KEEP_MS = 4000;
/** How many lines at once. More than this and it is scrolling text, not a glance. */
const LINES = 6;
/** How often the buffer is turned into a render. */
const FLUSH_MS = 100;

interface Line {
  key: string;
  at: number;
  value?: number;
}

function labelFor(key: string, presets: { id: string; name: string }[]): { name: string; swatch?: string } {
  const [kind, ...rest] = key.split(':');
  const id = rest.join(':');
  if (kind === 'setting') return { name: PIN_RANGE.get(id)?.label ?? id };
  if (kind === 'action') return { name: ACTION_LABELS[id as MidiAction] ?? id };
  if (kind === 'preset') return { name: presets.find(p => p.id === id)?.name ?? id };
  if (kind === 'dye') {
    const c = PALETTE[Number(id)];
    return { name: c?.name ?? `Dye ${id}`, swatch: c?.hex };
  }
  return { name: key };
}

/** Where a setting sits in its own travel, as a percentage. */
function readingFor(key: string, value: number | undefined): { pct: number; text: string } | null {
  if (value === undefined) return null;
  const spec = PIN_RANGE.get(key.slice('setting:'.length));
  if (!spec) return null;
  const span = spec.max - spec.min || 1;
  const pct = Math.max(0, Math.min(1, (value - spec.min) / span));
  return { pct, text: `${Math.round(pct * 100)}%` };
}

export function MidiActivity({ presets, onHide }: {
  presets: { id: string; name: string }[];
  onHide: () => void;
}) {
  const buffer = useRef(new Map<string, Line>());
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    const off = subscribeAllTouches((e: TouchEvent) => {
      // Keyed, so a fader being swept is one line that keeps moving rather
      // than four hundred lines all saying the same control.
      buffer.current.set(e.key, { key: e.key, at: e.at, value: e.value });
    });
    const id = setInterval(() => {
      const now = performance.now();
      for (const [k, l] of buffer.current) if (now - l.at > KEEP_MS) buffer.current.delete(k);
      const next = [...buffer.current.values()].sort((a, b) => b.at - a.at).slice(0, LINES);
      // Only re-render when the list actually reads differently: a held pad
      // repeats, and a list that is the same list should not cost a render.
      setLines(prev => {
        if (prev.length === next.length && prev.every((p, i) => p.key === next[i].key && p.at === next[i].at)) return prev;
        return next;
      });
    }, FLUSH_MS);
    return () => { off(); clearInterval(id); };
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-10 left-4 z-20 w-[248px] select-none"
      data-testid="midi-activity"
    >
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-faint">Controller</span>
        <button
          onClick={onHide}
          className="pointer-events-auto rounded p-1 text-faint transition-colors hover:bg-hover hover:text-text"
          aria-label="Hide the controller activity"
          data-testid="midi-activity-hide"
        >
          <X size={12} />
        </button>
      </div>
      {lines.length === 0 ? (
        <p className="px-1 text-[12px] leading-relaxed text-dim" data-testid="midi-activity-idle">
          Nothing yet. Move a fader or press a pad.
        </p>
      ) : (
        <div className="flex flex-col gap-1" data-testid="midi-activity-lines">
          {lines.map(l => {
            const { name, swatch } = labelFor(l.key, presets);
            const reading = l.key.startsWith('setting:') ? readingFor(l.key, l.value) : null;
            return (
              <div
                key={l.key}
                className="rounded-md border border-border bg-surface/90 px-2 py-1.5 backdrop-blur-[2px]"
                data-testid={`midi-activity-${l.key}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {swatch && <span className="h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: swatch }} />}
                    <span className="truncate text-[12px] font-medium text-text">{name}</span>
                  </span>
                  {reading && <span className="shrink-0 font-mono text-[11px] text-text-2">{reading.text}</span>}
                </div>
                {reading && (
                  <div className="mt-1 h-[3px] w-full rounded-full bg-active">
                    <div className="h-full rounded-full bg-text" style={{ width: `${reading.pct * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
