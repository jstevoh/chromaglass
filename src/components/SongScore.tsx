import { useMemo, useState, type MouseEvent } from 'react';
import type { SongMap } from '../lib/musicTypes';
import type { ActionWhat, ActionWhen, SongShow } from '../lib/songShows';
import {
  scoreOf, playhead, nudgeFor, nudgeStep, nudgeLabel, pinWhen, sectionName, mmss,
} from '../lib/songScore';

/**
 * The score (PLAN 28h): the song the show has heard, drawn as a lane of its
 * sections with its energy over them, the playhead where the show thinks the
 * song is, and the song's show laid on it as cues.
 *
 * One component for the desk's Score panel and the phone's Play sheet, so a
 * cue pinned on either is the same cue (the song's show, `songShows.ts`) and
 * a nudge from either moves the same clock. `touch` is the phone's sizes.
 *
 * The lane is one control, not a button per section: a ten-second intro in a
 * three-minute song is twelve pixels of a desk panel, under any finger's or
 * pointer's reach, so a tap picks the section under it and the arrows beside
 * the section's name step to the neighbours, which reaches the narrow ones.
 */

export type ScorePhase = 'none' | 'unmapped' | 'hearing' | 'analyzing' | 'ready';

export interface SongScoreProps {
  songName: string | null;
  map: SongMap | null;
  phase: ScorePhase;
  positionSec: number;
  /** How far the nudge has moved the song, seconds. */
  nudgeSec: number;
  /** The tempo the show hears, for a beat's nudge; 0 when it has none. */
  bpm: number;
  /** The song's show, when it has one. */
  show: SongShow | null;
  onNudge: (deltaSec: number) => void;
  onResetNudge: () => void;
  /** Add a cue to the song's show (making the show, if the song has none). */
  onPin: (when: ActionWhen, what: ActionWhat) => void;
  onRemoveCue: (actionId: string) => void;
  touch?: boolean;
}

/** What a cue pinned on the score can do: the song show's own actions, the ones a section change asks for. */
const PIN_WHATS: { label: string; what: ActionWhat }[] = [
  { label: 'Burst', what: { do: 'burst' } },
  { label: 'Next dyes', what: { do: 'dyes' } },
  { label: 'Zoom in', what: { do: 'zoom', zoom: 4, over: 3 } },
  { label: 'Whole plate', what: { do: 'zoom', zoom: 1, over: 3 } },
  { label: 'Kaleidoscope', what: { do: 'kaleidoscope', folds: 6 } },
  { label: 'Kaleido off', what: { do: 'kaleidoscope', folds: 0 } },
  { label: 'Drain', what: { do: 'drain' } },
  { label: 'To black', what: { do: 'blackout', over: 4 } },
  { label: 'Lights up', what: { do: 'lights-up', over: 3 } },
];

/** A section's fill by its kind: the chorus is the lit one, the edges of the song the dim ones. */
const FILL: Record<string, string> = {
  chorus: 'var(--color-accent)',
  drop: 'var(--color-accent)',
  bridge: 'var(--color-live)',
  verse: 'var(--color-text-2)',
  intro: 'var(--color-dim)',
  outro: 'var(--color-dim)',
};

const SAYS: Record<Exclude<ScorePhase, 'ready'>, (song: string | null) => string> = {
  none: () => 'No song yet. The score draws itself once a song is recognised and the show has heard it through once.',
  unmapped: (s) => `${s ?? 'This song'} has not been heard through yet. Its score is ready after the first full listen.`,
  hearing: (s) => `Hearing ${s ?? 'this song'} for the first time. Its score is ready when it ends.`,
  analyzing: (s) => `Working out the shape of ${s ?? 'the song'}…`,
};

export function SongScore(p: SongScoreProps) {
  const score = useMemo(() => (p.map && p.phase === 'ready' ? scoreOf(p.map, p.show) : null), [p.map, p.phase, p.show]);
  const head = score ? playhead(score, p.positionSec) : null;
  // The section being looked at: one picked on the lane, or else the one the song is in.
  const [picked, setPicked] = useState<number | null>(null);
  const [every, setEvery] = useState(false);
  const sel = score ? score.sections[picked ?? head?.index ?? -1] ?? null : null;

  const laneH = p.touch ? 72 : 56;
  const btnH = p.touch ? 'h-11 text-[14px]' : 'h-8 text-[12px]';
  // One or the other set of colours, never both: which of two classes wins is the stylesheet's order, not the list's.
  const btnOf = (on: boolean) => `${btnH} rounded-md border px-2.5 disabled:opacity-40 ${on
    ? 'border-accent-border bg-accent-bg text-accent-text'
    : 'border-border bg-elevated text-text-2 hover:bg-hover active:bg-active'}`;
  const btn = btnOf(false);
  const step = nudgeStep(p.bpm);
  const toStart = score ? nudgeFor(score, p.positionSec, 'section-start') : null;
  const toNext = score ? nudgeFor(score, p.positionSec, 'next-section') : null;
  const ready = !!score;

  const pickAt = (e: MouseEvent<HTMLButtonElement>) => {
    if (!score) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / Math.max(1, r.width);
    const i = score.sections.findIndex(s => x >= s.x0 && x < s.x1);
    setPicked(i >= 0 ? i : null);
  };

  return (
    <div className="flex flex-col gap-2 text-[13px]" data-testid="song-score">
      {score && head ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2 text-text-2" data-testid="score-now">
            <span className="text-text">{p.songName ?? 'This song'}</span>
            <span>
              {head.index !== null ? sectionName(score.sections[head.index], score.sections) : 'Between sections'}
              {' · '}{mmss(p.positionSec)} of {mmss(score.duration)}
            </span>
            {head.toNext !== null && <span className="text-dim">next in {mmss(head.toNext)}</span>}
          </p>
          <button
            type="button"
            onClick={pickAt}
            aria-label="The song's sections: pick one to put a cue on it"
            data-testid="score-lane"
            className="relative w-full overflow-hidden rounded-md border border-border bg-bg text-left"
            style={{ height: laneH }}
          >
            {score.sections.map(s => (
              <span
                key={s.index}
                data-testid={`score-section-${s.index}`}
                className="absolute bottom-0 top-0 border-r border-bg"
                style={{
                  left: `${s.x0 * 100}%`, width: `${(s.x1 - s.x0) * 100}%`,
                  background: FILL[s.kind ?? ''] ?? 'var(--color-text-2)',
                  opacity: 0.18 + 0.32 * Math.max(0, Math.min(1, s.energy)) + (sel?.index === s.index ? 0.25 : 0),
                }}
              />
            ))}
            {score.sections.map(s => (s.x1 - s.x0 > 0.07 ? (
              <span key={`l${s.index}`} className="pointer-events-none absolute top-1 truncate px-1 text-[11px] text-text"
                style={{ left: `${s.x0 * 100}%`, width: `${(s.x1 - s.x0) * 100}%` }}>
                {sectionName(s, score.sections)}
              </span>
            ) : null))}
            {score.energy.length > 1 && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                <polyline
                  fill="none" stroke="var(--color-text)" strokeOpacity={0.55} strokeWidth={1.2} vectorEffect="non-scaling-stroke"
                  points={score.energy.map((v, i) => `${(i / (score.energy.length - 1)) * 100},${96 - v * 62}`).join(' ')}
                />
              </svg>
            )}
            {score.cues.map((c, i) => (
              <span key={`${c.actionId}-${i}`} title={`${c.when}: ${c.what}`} data-testid="score-cue"
                className="pointer-events-none absolute bottom-1 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border border-bg"
                style={{ left: `${c.x * 100}%`, background: c.pinned ? 'var(--color-accent-text)' : 'var(--color-warn)' }} />
            ))}
            <span className="pointer-events-none absolute bottom-0 top-0 w-0.5 -translate-x-1/2 bg-text" style={{ left: `${head.x * 100}%` }} data-testid="score-playhead" />
          </button>
        </>
      ) : (
        <p className="leading-relaxed text-dim" data-testid="score-says">{SAYS[p.phase === 'ready' ? 'unmapped' : p.phase](p.songName)}</p>
      )}

      {/*
        The nudge. Always drawn, so a performer finds it where it was, and
        greyed until there is a song to move.
      */}
      <div className="flex flex-wrap items-center gap-1.5" data-testid="score-nudge">
        <button type="button" className={btn} disabled={!ready} onClick={() => p.onNudge(-step)} data-testid="score-nudge-earlier"
          title="The show is ahead of the song: move it back">
          − {p.bpm >= 40 ? 'beat' : '½ s'}
        </button>
        <button type="button" className={btn} disabled={!ready} onClick={() => p.onNudge(step)} data-testid="score-nudge-later"
          title="The show is behind the song: move it on">
          + {p.bpm >= 40 ? 'beat' : '½ s'}
        </button>
        <button type="button" className={btn} disabled={toStart === null} onClick={() => toStart !== null && p.onNudge(toStart)} data-testid="score-section-now"
          title="The show reached this section early: it starts now">
          Section starts now
        </button>
        <button type="button" className={btn} disabled={toNext === null} onClick={() => toNext !== null && p.onNudge(toNext)} data-testid="score-next-now"
          title="The song is already in the next section">
          Next section now
        </button>
        {nudgeLabel(p.nudgeSec) && (
          <button type="button" className={btn} onClick={p.onResetNudge} data-testid="score-nudge-reset" title="Take the nudge back out">
            {nudgeLabel(p.nudgeSec)} · reset
          </button>
        )}
      </div>

      {score && sel && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2" data-testid="score-section">
          <div className="flex items-center gap-1.5">
            <button type="button" className={btn} aria-label="The section before" disabled={sel.index === 0}
              onClick={() => setPicked(sel.index - 1)} data-testid="score-pick-prev">‹</button>
            <span className="min-w-0 flex-1 truncate text-text">
              {sectionName(sel, score.sections)} <span className="text-dim">{mmss(sel.start)}–{mmss(sel.end)}</span>
            </span>
            <button type="button" className={btn} aria-label="The section after" disabled={sel.index >= score.sections.length - 1}
              onClick={() => setPicked(sel.index + 1)} data-testid="score-pick-next">›</button>
            {picked !== null && (
              <button type="button" className={btn} onClick={() => setPicked(null)} data-testid="score-pick-follow" title="Back to the section the song is in">Now</button>
            )}
          </div>
          {score.cues.filter(c => c.section === sel.index).map((c, i) => (
            <div key={`${c.actionId}-${i}`} className="flex items-center gap-1.5 text-text-2" data-testid="score-section-cue">
              <span className="min-w-0 flex-1 truncate">{c.what} <span className="text-dim">({c.when.toLowerCase()})</span></span>
              <button type="button" className={btn} aria-label={`Remove ${c.what}`} onClick={() => p.onRemoveCue(c.actionId)} data-testid="score-cue-remove">×</button>
            </div>
          ))}
          {sel.kind && sel.kind !== 'any' && (
            <div className="flex gap-1.5" role="group" aria-label="Which sections the cue is on">
              <button type="button" aria-pressed={!every} onClick={() => setEvery(false)} data-testid="score-pin-this"
                className={btnOf(!every)}>
                This {sel.label.toLowerCase()} only
              </button>
              <button type="button" aria-pressed={every} onClick={() => setEvery(true)} data-testid="score-pin-every"
                className={btnOf(every)}>
                Every {sel.label.toLowerCase()}
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5" data-testid="score-pin">
            {PIN_WHATS.map(w => (
              <button key={w.label} type="button" className={btn} data-testid={`score-pin-${w.label.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => p.onPin(pinWhen(sel, every && !!sel.kind && sel.kind !== 'any'), w.what)}>
                + {w.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {score && score.loose.length > 0 && (
        <p className="text-dim" data-testid="score-loose">
          Also, off the timeline: {score.loose.map(l => `${l.when.toLowerCase()}, ${l.what.toLowerCase()}`).join('; ')}.
        </p>
      )}
    </div>
  );
}
