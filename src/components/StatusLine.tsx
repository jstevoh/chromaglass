import type { ReactNode } from 'react';
import { Circle, Radio, Projector, Video, Clapperboard, Activity } from 'lucide-react';

/**
 * What is true right now, in one line.
 *
 * Almost all of this was already computed and simply never shown: whether the
 * projector is connected, whether MIDI came up, which rung the engine settled
 * on, how far through a sequence stage the show is. During a set that is
 * exactly the information you need and cannot get — you find out the projector
 * dropped when the wall goes dark.
 *
 * Read across, in the order a problem tends to arrive: what is playing, what
 * it is hearing, what is driving it, and what it is coming out of.
 */

const secs = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** A lamp: lit when the thing is there, dim when it is not. */
function Lamp({ on, label, icon, tone = 'white', testId }: {
  on: boolean; label: string; icon: ReactNode; tone?: 'white' | 'red'; testId?: string;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 text-[11px] ${
        on ? (tone === 'red' ? 'text-red-300' : 'text-emerald-300') : 'text-white/25'
      }`}
      title={`${label}: ${on ? 'yes' : 'no'}`}
      data-testid={testId}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </span>
  );
}

interface StatusLineProps {
  lookName: string | null;
  /** Seconds the current look has been up. */
  lookFor: number;
  sequence: { running: boolean; name: string | null; stageName: string | null; progress: number };
  audioSource: string;
  level: number;              // 0..1
  engine: string;
  casting: boolean;
  midiOn: boolean;
  cameraOn: boolean;
  recordingFor: number | null;
  blackout: boolean;
}

export function StatusLine({
  lookName, lookFor, sequence, audioSource, level, engine,
  casting, midiOn, cameraOn, recordingFor, blackout,
}: StatusLineProps) {
  return (
    <div
      className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/65 px-4 py-2.5 backdrop-blur-xl pointer-events-auto overflow-x-auto scrollbar-hide"
      data-testid="status-line"
    >
      {/* What is on the wall, and for how long. */}
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-[9px] uppercase tracking-[0.2em] text-white/35 shrink-0">Look</span>
        <span className="text-[12px] font-semibold truncate" data-testid="status-look">{lookName ?? '—'}</span>
        <span className="text-[11px] font-mono tabular-nums text-white/40 shrink-0">{secs(lookFor)}</span>
      </div>

      {sequence.running && (
        <div className="flex items-center gap-2 min-w-0" data-testid="status-sequence">
          <Clapperboard size={13} className="text-white/40 shrink-0" />
          <span className="text-[11px] truncate text-white/70">{sequence.stageName ?? sequence.name}</span>
          <span className="h-1.5 w-16 shrink-0 rounded-full bg-white/10 overflow-hidden">
            <span className="block h-full bg-white/70" style={{ width: `${Math.round(sequence.progress * 100)}%` }} />
          </span>
        </div>
      )}

      <div className="flex-1" />

      {/* What it is hearing. The meter is the thing you glance at when the
          plate has gone still and you need to know whose fault it is. */}
      <div className="flex items-center gap-2 shrink-0" data-testid="status-audio">
        <Activity size={13} className="text-white/40" />
        <span className="text-[11px] uppercase tracking-wider text-white/60">{audioSource}</span>
        <span className="h-1.5 w-14 rounded-full bg-white/10 overflow-hidden">
          <span className="block h-full bg-emerald-400" style={{ width: `${Math.round(Math.min(1, level) * 100)}%` }} />
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Lamp on={casting} label="Projector" icon={<Projector size={13} />} testId="status-cast" />
        <Lamp on={midiOn} label="MIDI" icon={<Radio size={13} />} testId="status-midi" />
        <Lamp on={cameraOn} label="Room" icon={<Video size={13} />} testId="status-room" />
        {recordingFor !== null && (
          <span className="flex items-center gap-1.5 text-[11px] text-red-300" data-testid="status-recording">
            <Circle size={9} fill="currentColor" /> {secs(recordingFor)}
          </span>
        )}
      </div>

      <span className="text-[11px] text-white/35 shrink-0 hidden lg:inline" title="What the solver settled on" data-testid="status-engine">
        {engine}
      </span>

      {blackout && (
        <span className="rounded-lg bg-red-500/20 border border-red-400/40 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-red-200 shrink-0" data-testid="status-blackout">
          Blackout
        </span>
      )}
    </div>
  );
}
