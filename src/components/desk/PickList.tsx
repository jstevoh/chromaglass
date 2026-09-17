import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { PINNABLE, MAX_PINS, type DeskSpec } from '../../lib/deskPins';
import { SECTION_NAME, SETTINGS_SECTIONS } from '../../lib/settingsMap';
import type { VisualizerSettings } from '../../types';

/**
 * Choose what rides on a strip.
 *
 * One component for both desks. Perform had its own, over the forty MIDI
 * knows; Design had none at all, because its eight were a constant in the
 * file. Both now pick from the same ninety, grouped by the settings section
 * each one is shown in, with a box to type in — because a flat ninety is the
 * problem this is meant to solve, not a smaller copy of it.
 */
export function PickList({ chosen, onChange, testId }: {
  chosen: (keyof VisualizerSettings)[];
  onChange: (keys: (keyof VisualizerSettings)[]) => void;
  testId: string;
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  /** Section order follows the panel's rail, so the two read the same way. */
  const groups = useMemo(() => {
    const bySection = new Map<string, DeskSpec[]>();
    for (const spec of PINNABLE) {
      if (query && !spec.label.toLowerCase().includes(query) && !(SECTION_NAME.get(spec.section) ?? '').toLowerCase().includes(query)) continue;
      const list = bySection.get(spec.section) ?? [];
      list.push(spec);
      bySection.set(spec.section, list);
    }
    return SETTINGS_SECTIONS
      .map(s => [s.id, bySection.get(s.id) ?? []] as const)
      .filter(([, list]) => list.length > 0);
  }, [query]);

  const full = chosen.length >= MAX_PINS;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid={testId}>
      <div className="relative shrink-0 px-2 pb-2">
        <Search size={13} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Find a control…"
          aria-label="Find a control"
          className="h-8 w-full rounded-md border border-border-strong bg-elevated pl-7 pr-2 text-[13px] text-text outline-none placeholder:text-faint focus:border-text/40"
          data-testid={`${testId}-search`}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-2 pb-2">
        {groups.length === 0 && (
          <p className="px-2 py-3 text-[13px] text-dim" data-testid={`${testId}-empty`}>Nothing matches “{q}”.</p>
        )}
        {groups.map(([section, specs]) => (
          <div key={section}>
            <div className="sticky top-0 bg-bg px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.18em] text-faint">
              {SECTION_NAME.get(section) ?? section}
            </div>
            {specs.map(spec => {
              const on = chosen.includes(spec.key);
              return (
                <button
                  key={String(spec.key)}
                  onClick={() => onChange(on ? chosen.filter(k => k !== spec.key) : [...chosen, spec.key].slice(0, MAX_PINS))}
                  disabled={!on && full}
                  title={!on && full ? `A strip holds ${MAX_PINS}. Take one off first.` : undefined}
                  className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors disabled:opacity-30 ${
                    on ? 'bg-hover text-text' : 'text-muted hover:bg-hover hover:text-text'
                  }`}
                  data-testid={`${testId}-${String(spec.key)}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    on ? 'border-text bg-text text-bg' : 'border-border-strong'
                  }`}>
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="text-[13px]">{spec.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
