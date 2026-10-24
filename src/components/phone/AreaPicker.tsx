import type { PlateArea } from '../../lib/plateAreas';

/**
 * Which area of the dish a patch cord works in (PLAN 25h), picked on a
 * thumbnail of the plate.
 *
 * Built for a thumb first, because the patch bay is the same sheet on a phone
 * as on the desk (SettingsPanel fills the screen there), and a list of "Area
 * 1, Area 2" says nothing about where on the glass a cord will land: the
 * look's areas are places, so they are picked where they are. Each is drawn
 * at its place and size on the dish, in its family's colours, with the part
 * of the music it already takes; a tap on one aims the cord there, a tap on
 * the glass between them (or on Whole plate) aims it back at every place. The
 * circles' targets are their whole drawn disc and never under 40 px across
 * (the thumbnail is 132 on a phone, where a Velvet pool is 37 across, so each
 * takes a ring of glass round it into its target), and Whole plate is a 40 px
 * pill, the touch rule's size.
 */
export function AreaPicker({ areas, colours, value, onChange, testId }: {
  areas: readonly PlateArea[];
  /** Each area's family, as hex colours, first first. */
  colours: readonly (readonly string[])[];
  value: number | undefined;
  onChange: (area: number | undefined) => void;
  testId?: string;
}) {
  const SIZE = 132;
  const BAND: Record<string, string> = { bass: 'bass', mid: 'mids', treble: 'hats', any: 'any' };
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <svg
        width={SIZE} height={SIZE} viewBox="0 0 1 1"
        className="shrink-0 rounded-full touch-manipulation"
        role="group" aria-label="Where this patch works"
      >
        <circle cx={0.5} cy={0.5} r={0.49} fill="#0b0910" stroke={value === undefined ? '#fff' : '#ffffff33'} strokeWidth={0.012}
          onClick={() => onChange(undefined)} />
        {areas.map((a, i) => {
          const on = value === i;
          const fam = colours[i] ?? ['#888'];
          // A target never under 40 px: the drawn disc, or a clear ring round it.
          const hit = Math.max(a.r, 20 / SIZE);
          return (
            <g key={i} role="button" tabIndex={0} aria-pressed={on}
              aria-label={`Area ${i + 1}: ${a.liquid}, ${BAND[a.band] ?? a.band}`}
              data-testid={testId ? `${testId}-area-${i}` : undefined}
              onClick={(e) => { e.stopPropagation(); onChange(on ? undefined : i); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(on ? undefined : i); } }}
              className="cursor-pointer outline-none">
              <circle cx={a.x} cy={a.y} r={hit} fill="transparent" />
              <circle cx={a.x} cy={a.y} r={a.r} fill={fam[0]} fillOpacity={on ? 0.95 : 0.55}
                stroke={on ? '#fff' : 'none'} strokeWidth={0.014} />
              {fam[1] && <circle cx={a.x + a.r * 0.35} cy={a.y - a.r * 0.35} r={a.r * 0.4} fill={fam[1]} fillOpacity={on ? 0.95 : 0.55} />}
              <text x={a.x} y={a.y + 0.02} textAnchor="middle" fontSize={0.07} fill="#fff" style={{ pointerEvents: 'none' }}>{i + 1}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-col gap-1 min-w-0">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-pressed={value === undefined}
          className={`min-h-[40px] px-3 rounded-full text-[12px] font-medium border ${value === undefined ? 'bg-white/15 border-white/40' : 'bg-white/5 border-white/10'}`}
          data-testid={testId ? `${testId}-plate` : undefined}
        >
          Whole plate
        </button>
        <span className="text-[11px] text-white/45 leading-snug">
          {value === undefined
            ? 'Tap an area to work there alone'
            : `Area ${value + 1}: the ${areas[value]?.liquid ?? ''}, which takes the ${BAND[areas[value]?.band ?? 'any']}`}
        </span>
      </div>
    </div>
  );
}
