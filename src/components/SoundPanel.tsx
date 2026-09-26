import React, { useRef } from 'react';
import { Mic, Monitor, FileAudio, Music, Sparkles, Slash, Play, Pause, Repeat, Waves } from 'lucide-react';
import { Sheet } from './ui';
import { LIBRARY, librarySeconds, clock, credits, type Track } from '../lib/musicLibrary';
import { SCALES, NOTES, type DroneParams, type ScaleName, type Wave } from '../lib/plateDrone';

/**
 * Sound: where the show's music comes from, in one place you can find.
 *
 * It was not in one place, and it was not findable. The sources lived in a
 * strip gated on `showControls && !showSettings && !deskUp` — so it hid when
 * Settings opened, and hid again whenever either desk was up, which is where
 * the work happens. A shelf of music shipped into that strip and the owner
 * could not find it, which is the correct outcome for a control nobody can
 * reach: it may as well not have been built.
 *
 * So sound is a tab, beside Perform, Design and Songs, because that is what it
 * is — one of the things you set up before a room fills.
 */

export type AudioSource = 'none' | 'microphone' | 'system' | 'file' | 'simulated' | 'drone';

const SOURCES: ReadonlyArray<{
  id: AudioSource; label: string; icon: typeof Mic; blurb: string;
}> = [
  { id: 'none', label: 'Silent', icon: Slash,
    blurb: 'No sound drives the plate. It still moves — the automation pours and stirs on its own.' },
  { id: 'microphone', label: 'Microphone', icon: Mic,
    blurb: 'The room, taken raw: no echo cancellation, no noise suppression, no auto gain. Those are tuned for speech on a call and treat a steady groove as noise to duck.' },
  { id: 'system', label: 'Another tab', icon: Monitor,
    blurb: 'Share a tab that is playing music and the show listens to it in stereo. The sound stays in that tab, so a video call sharing *this* tab will not carry it.' },
  { id: 'file', label: 'Your file', icon: FileAudio,
    blurb: 'Play a track from this machine. It plays out of this tab, so a shared tab carries the music too.' },
  { id: 'drone', label: 'The plate', icon: Waves,
    blurb: 'The glass plays itself: four voices tuned to a scale, lit by where the dye is and keyed by the colour on it. It sounds out of this tab, so a shared tab carries it.' },
  { id: 'simulated', label: 'A band in a box', icon: Sparkles,
    blurb: 'A synthesised band — kick, snare, hats, bass and a pad, in verses and choruses. No device, no permission, nothing to be asked for.' },
];

export function SoundPanel({
  source, onSource, inputs, inputId, onInput,
  playing, time, loop, onLoop, onToggle, onSeek,
  nowPlaying, onPickFile, onPickTrack, drone, onDrone, onClose,
}: {
  source: AudioSource;
  onSource: (s: AudioSource) => void;
  inputs: { id: string; label: string }[];
  inputId: string;
  onInput: (id: string) => void;
  playing: boolean;
  time: { t: number; d: number };
  loop: boolean;
  onLoop: (on: boolean) => void;
  onToggle: () => void;
  onSeek: (t: number) => void;
  nowPlaying: { name: string; track?: Track } | null;
  onPickFile: (f: File) => void;
  onPickTrack: (t: Track) => void;
  drone: DroneParams;
  onDrone: (p: Partial<DroneParams>) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const chosen = SOURCES.find(s => s.id === source) ?? SOURCES[0];

  return (
    <Sheet title={<><Music size={16} /> Sound</>} onClose={onClose} width={760} height={680} testId="sound-panel">
      <div className="flex-1 overflow-y-auto p-5">
        <input
          ref={fileRef} type="file" accept="audio/*" className="hidden" data-testid="sound-file-input"
          onChange={e => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ''; }}
        />

        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">Where the sound comes from</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SOURCES.map(s => {
            const Icon = s.icon;
            const on = source === s.id;
            return (
              <button
                key={s.id}
                onClick={() => (s.id === 'file' ? fileRef.current?.click() : onSource(s.id))}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors ${
                  on ? 'border-white/60 bg-white/10 text-text' : 'border-border text-muted hover:bg-hover hover:text-text'
                }`}
                data-testid={`sound-source-${s.id}`}
              >
                <Icon size={16} />
                <span className="text-[10px] font-bold uppercase tracking-wider">{s.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 min-h-[32px] text-[12px] leading-relaxed text-muted">{chosen.blurb}</p>

        {source === 'drone' && (
          <div className="mt-3 rounded-xl border border-border p-3" data-testid="drone-controls">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted">The instrument</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-[12px] text-muted">
                <span className="w-20 shrink-0">Key</span>
                <select
                  value={drone.root}
                  onChange={e => onDrone({ root: Number(e.target.value) })}
                  className="flex-1 rounded-lg border border-border bg-black/30 px-2 py-1.5 text-text"
                  data-testid="drone-root"
                >
                  {NOTES.map((n, i) => <option key={n} value={i}>{n}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[12px] text-muted">
                <span className="w-20 shrink-0">Scale</span>
                <select
                  value={drone.scale}
                  onChange={e => onDrone({ scale: e.target.value as ScaleName })}
                  className="flex-1 rounded-lg border border-border bg-black/30 px-2 py-1.5 text-text"
                  data-testid="drone-scale"
                >
                  {Object.keys(SCALES).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[12px] text-muted">
                <span className="w-20 shrink-0">Shape</span>
                <select
                  value={drone.wave}
                  onChange={e => onDrone({ wave: e.target.value as Wave })}
                  className="flex-1 rounded-lg border border-border bg-black/30 px-2 py-1.5 text-text"
                  data-testid="drone-wave"
                >
                  {(['sine', 'triangle', 'sawtooth', 'square'] as const).map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </label>
              {([
                ['voices', 'Voices', 1, 4, 1, (v: number) => String(v)],
                ['octave', 'Octave', 0, 4, 1, (v: number) => String(v)],
                ['cutoff', 'Tone', 120, 6000, 20, (v: number) => `${Math.round(v)} Hz`],
                ['resonance', 'Edge', 0.5, 14, 0.1, (v: number) => v.toFixed(1)],
                ['sub', 'Weight', 0, 1, 0.01, (v: number) => `${Math.round(v * 100)}%`],
                ['drift', 'Drift', 0, 60, 1, (v: number) => `${Math.round(v)}¢`],
                ['reverb', 'Room', 0, 6, 0.1, (v: number) => (v < 0.05 ? 'dry' : `${v.toFixed(1)}s`)],
                ['level', 'Level', 0, 1, 0.01, (v: number) => `${Math.round(v * 100)}%`],
              ] as const).map(([key, label, min, max, step, fmt]) => (
                <label key={key} className="flex items-center gap-2 text-[12px] text-muted">
                  <span className="w-20 shrink-0">{label}</span>
                  <input
                    type="range" min={min} max={max} step={step}
                    value={drone[key] as number}
                    onChange={e => onDrone({ [key]: Number(e.target.value) } as Partial<DroneParams>)}
                    className="h-6 flex-1 accent-white"
                    data-testid={`drone-${key}`}
                  />
                  <span className="w-14 text-right font-mono text-[10px] text-faint">{fmt(drone[key] as number)}</span>
                </label>
              ))}
            </div>
            {/*
              Said out loud, because it is the one surprising thing about this
              source: it listens to the plate it is driving.
            */}
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              The plate voices this and this drives the plate, which is a loop — so it reads slowly
              and glides rather than steps, and follows the plate's weather over seconds instead of
              chasing every frame.
            </p>
          </div>
        )}

        {source === 'microphone' && inputs.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted">Which microphone</p>
            <select
              value={inputId}
              onChange={e => onInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-[12px] text-text"
              data-testid="sound-input-picker"
            >
              <option value="">Whatever the system offers</option>
              {inputs.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </div>
        )}

        <div className="my-5 border-t border-border" />

        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted">The shelf</p>
          <span className="font-mono text-[10px] text-faint">{clock(librarySeconds())} · plays from this tab</span>
        </div>
        <div className="rounded-xl border border-border">
          {LIBRARY.map((t, i) => {
            const on = nowPlaying?.track?.src === t.src;
            return (
              <button
                key={t.src}
                onClick={() => onPickTrack(t)}
                className={`flex w-full items-baseline gap-3 px-3 py-2.5 text-left transition-colors ${
                  i ? 'border-t border-border' : ''
                } ${on ? 'bg-white/10 text-text' : 'text-muted hover:bg-hover hover:text-text'}`}
                data-testid={`sound-track-${t.src.split('/').pop()?.replace('.mp3', '')}`}
              >
                {on && playing ? <Pause size={13} /> : <Play size={13} />}
                <span className="text-[13px] font-medium">{t.title}</span>
                <span className="text-[12px] text-faint">{t.artist}</span>
                <span className="ml-auto font-mono text-[10px] text-faint">{clock(t.seconds)}</span>
                <span className="w-24 text-right font-mono text-[10px] text-faint">{t.licence}</span>
              </button>
            );
          })}
        </div>
        {/*
          The credit is on screen because the licence asks for it where the work
          is used, and a projector in a room full of people is where it is used.
        */}
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Music by {credits()}, and public-domain pieces by Thomas Park. Re-encoded and level-matched
          for a room. Sources on <a href="https://archive.org/details/netlabels" target="_blank" rel="noreferrer" className="underline hover:text-muted">archive.org</a>.
          Nothing here carries a non-commercial or no-derivatives restriction.
        </p>

        {nowPlaying && (
          <>
            <div className="my-5 border-t border-border" />
            <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5" data-testid="sound-transport">
              <button onClick={onToggle} className="rounded-full p-2 hover:bg-hover" aria-label={playing ? 'Pause' : 'Play'} data-testid="sound-play">
                {playing ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-text">{nowPlaying.name}</p>
                {nowPlaying.track?.mustCredit && (
                  <p className="truncate text-[11px] text-faint" data-testid="sound-credit">
                    {nowPlaying.track.artist} · {nowPlaying.track.licence}
                  </p>
                )}
              </div>
              <span className="font-mono text-[10px] text-faint">{clock(time.t)}</span>
              <input
                type="range" min={0} max={Math.max(1, time.d)} step={0.1}
                value={Math.min(time.t, time.d || 0)}
                onChange={e => onSeek(parseFloat(e.target.value))}
                className="h-6 w-48 accent-white" aria-label="Seek" data-testid="sound-seek"
              />
              <span className="font-mono text-[10px] text-faint">{clock(time.d)}</span>
              <button
                onClick={() => onLoop(!loop)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  loop ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100' : 'border-border text-faint hover:text-muted'
                }`}
                title={nowPlaying.track
                  ? 'Hand over to the next track on the shelf when this one ends, and round again'
                  : 'Play this file again when it ends, so the room is never left in silence'}
                data-testid="sound-loop"
              >
                <Repeat size={11} />
                {nowPlaying.track ? 'rolls on' : 'repeats'}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
