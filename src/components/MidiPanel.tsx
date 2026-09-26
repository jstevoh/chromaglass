import { useRef, useState } from 'react';
import { Sheet } from './ui';
import { Sliders, Download, FolderOpen, Trash2, Radio, Zap, LayoutGrid, Wand2, Music } from 'lucide-react';
import {
  ACTION_LABELS, FACTORY_MAPS, factoryFor, LEARNABLE_SETTINGS, sourceLabel, targetLabel,
  MAPPABLE_SOURCES, MUSIC_SOURCES, MUSIC_SOURCE_LABELS, isMapping, triggerable, soundMappable,
  type MidiAction, type MidiTarget, type MusicSource, type SoundBinding,
} from '../lib/midi';
import type { MidiController } from '../hooks/useMidi';
import { PALETTE } from '../constants';
import { ControllerSurface } from './ControllerSurface';
import { SURFACES, surfaceFor } from '../lib/controllerSurface';

/**
 * The MIDI panel: turn the controller on, pick a factory map or teach it
 * (choose what a control should do, then touch the control), and keep the
 * result as a file so the next laptop learns it in one click.
 */
interface MidiPanelProps {
  midi: MidiController;
  presets: { id: string; name: string }[];
  /** Whether the controller's own readout is up on the desk, and how to change it. */
  activity: boolean;
  onActivity: (on: boolean) => void;
  onClose: () => void;
}

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40';
const chip = (active: boolean) => `px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${active ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'}`;

/** A depth as the panel prints it: signed, in percent of the setting's travel. */
const depthLabel = (d: number | undefined): string => `${(d ?? 0) >= 0 ? '+' : '−'}${Math.round(Math.abs(d ?? 0) * 100)}%`;
const soundLabel = (b: SoundBinding): string =>
  `♪ ${MUSIC_SOURCE_LABELS[b.source]}${isMapping(b) ? ` ${depthLabel(b.depth)}` : ''}`;

/**
 * Why a control cannot be bound to the music, or null when it can.
 *
 * A setting can when the patch bay can ride it (`soundMappable`, the same rule
 * a loaded file is held to, and held to `SETTING_TRAVEL` by `npm run learn`), which
 * leaves out the masters (Sound Impact and the rest decide how hard a source
 * drives the plate, and a source riding its own master is a loop) and the
 * room's own dials. An action can unless a beat pressing it twice a second
 * would wreck the show (`triggerable` in `midi.ts` says which and why).
 * Said on the button rather than hidden, so a control that cannot follow the
 * music does not look like one that was forgotten.
 */
function whyNotMusic(target: MidiTarget): string | null {
  if (target.kind === 'setting') return soundMappable(target.key) ? null : 'This one sets how hard a source drives the plate, so the music cannot ride it';
  if (target.kind === 'action') return triggerable(target.action) ? null : 'Not on a beat: pressed on every hit it would toggle twice a second';
  return null;
}

/**
 * Bind one control to the music: pick a source, and for a slider a depth.
 *
 * Inline under the row rather than in a dialog, because it is the same row's
 * second Learn button and a performer teaching five controls in a row wants
 * to see which one they are on.
 */
function SoundLearnEditor({ target, label, existing, onBind }: {
  target: MidiTarget;
  label: string;
  existing: SoundBinding[];
  onBind: (b: Omit<SoundBinding, 'id'>) => void;
}) {
  const mapping = target.kind === 'setting';
  const sources: readonly MusicSource[] = mapping ? MAPPABLE_SOURCES : MUSIC_SOURCES;
  const [source, setSource] = useState<MusicSource>(existing[0]?.source ?? 'kick');
  const [depth, setDepth] = useState<number>(existing.find(b => b.source === source)?.depth ?? 0.5);
  // "the kick", but "Band 4 · 378–800 Hz" keeps its capitals: it is a name and a unit.
  const name = source.startsWith('band') ? MUSIC_SOURCE_LABELS[source] : `the ${MUSIC_SOURCE_LABELS[source].toLowerCase()}`;
  return (
    <div className="mb-2 mt-1 rounded-lg border border-amber-300/30 bg-amber-300/5 p-2" data-testid="sound-editor">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={source}
          onChange={e => {
            const next = e.target.value as MusicSource;
            setSource(next);
            const had = existing.find(b => b.source === next);
            if (had?.depth !== undefined) setDepth(had.depth);
          }}
          aria-label={`What in the music drives ${label}`}
          className="min-h-7 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[12px] text-white outline-none focus:border-white/40"
          data-testid="sound-source"
        >
          {sources.map(x => <option key={x} value={x}>{MUSIC_SOURCE_LABELS[x]}</option>)}
        </select>
        {mapping && (
          <label className="flex min-w-[150px] flex-1 items-center gap-2 text-[12px] text-white/70">
            Depth
            <input
              type="range" min={-1} max={1} step={0.05} value={depth}
              onChange={e => setDepth(Number(e.target.value))}
              className="h-6 min-w-0 flex-1"
              aria-label={`How far ${label} follows the music`}
              data-testid="sound-depth"
            />
            <span className="w-11 text-right font-mono text-[12px] text-white/80">{depthLabel(depth)}</span>
          </label>
        )}
        <button
          onClick={() => onBind(mapping ? { source, target, depth } : { source, target })}
          className={`${chip(true)} min-h-7`}
          data-testid="sound-bind"
        >
          Bind
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-white/60">
        {mapping
          ? `Follows the level: with ${name} at full, ${label} moves ${depthLabel(depth)} of its travel. Sound Impact is its master.`
          : source === 'beat' || source === 'bar'
            ? `Fires on ${source === 'beat' ? 'every beat' : 'every fourth beat'} of the beat clock, once it has locked to the music.`
            : `Fires on each ${source === 'level' ? 'new sound in the level' : `hit of ${name}`}, on the beat when the beat clock has it, a Beat Lead ahead of the sound.`}
      </p>
    </div>
  );
}

export function MidiPanel({ midi, presets, activity, onActivity, onClose }: MidiPanelProps) {
  const [tab, setTab] = useState<'settings' | 'actions' | 'presets' | 'dyes'>('settings');
  // The controller drawn to scale: the fastest way to make a map, and the
  // cheat sheet to read during a show. Falls back to the first surface we
  // know so a map can be built before the hardware arrives.
  const [showSurface, setShowSurface] = useState(false);
  const surface = surfaceFor(midi.activeInputName) ?? SURFACES[0];
  const [encoder, setEncoder] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  /** Which row's music editor is open, by its key; one at a time. */
  const [musicOpen, setMusicOpen] = useState<string | null>(null);
  /** What auto-map decided last time, so the panel can say what it just did. */
  const [autoSaid, setAutoSaid] = useState<string | null>(null);
  const presetName = (id: string) => presets.find(p => p.id === id)?.name;
  /** Which map the plugged-in hardware wants, so its chip can say so. */
  const detected = midi.inputs.map(i => factoryFor(i.name)).find(Boolean) ?? null;

  const learnButton = (target: MidiTarget, label: string, key: string) => {
    const isLearning = midi.learning && JSON.stringify(midi.learning.target) === JSON.stringify(target);
    const same = (t: MidiTarget) => JSON.stringify(t) === JSON.stringify(target);
    const bound = midi.map.bindings.filter(b => same(b.target));
    const heard = (midi.map.sound ?? []).filter(b => same(b.target));
    const notMusic = whyNotMusic(target);
    const open = musicOpen === key;
    return (
      <div key={key} className="border-b border-white/5">
        <div className="flex items-center gap-2 py-1" data-testid={`midi-target-${key}`}>
          <span className="flex-1 text-[11px] truncate">{label}</span>
          <span className="text-[11px] font-mono text-white/40 truncate max-w-[40%]">
            {[...bound.map(b => sourceLabel(b.source)), ...heard.map(soundLabel)].join(', ')}
          </span>
          <button
            onClick={() => (isLearning ? midi.cancelLearn() : midi.learn(target, encoder && target.kind === 'setting' ? 'relative' : 'absolute'))}
            disabled={!midi.enabled}
            className={`px-2 py-1 rounded-md border text-[12px] font-medium disabled:opacity-30 ${isLearning ? 'bg-amber-400 text-black border-amber-400 animate-pulse' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            data-testid={`midi-learn-${key}`}
          >
            {isLearning ? 'Touch it…' : 'Learn'}
          </button>
          {/*
            The second Learn: the music (PLAN §5). It needs no controller, so
            it is live whether MIDI is on or not.
          */}
          <button
            onClick={() => setMusicOpen(open ? null : key)}
            disabled={notMusic !== null}
            title={notMusic ?? `Bind ${label} to the music`}
            aria-label={`Bind ${label} to the music`}
            aria-expanded={open}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border disabled:opacity-30 ${open || heard.length ? 'bg-amber-300/20 border-amber-300/50 text-amber-100' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            data-testid={`sound-learn-${key}`}
          >
            <Music size={12} />
          </button>
        </div>
        {open && (
          <SoundLearnEditor
            target={target}
            label={label}
            existing={heard}
            onBind={(b) => { midi.learnSound(b); setMusicOpen(null); }}
          />
        )}
      </div>
    );
  };

  // A sheet rather than a left-edge drawer: under a desk the drawer covered
  // the cue list, which is the one column you need while teaching a pad to
  // fire cues.
  return (
    <Sheet title={<><Sliders size={16} /> MIDI</>} onClose={onClose} testId="midi-panel">
      {showSurface && (
        <ControllerSurface midi={midi} presets={presets} surface={surface} onClose={() => setShowSurface(false)} />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide p-6 text-white">
      <p className="text-[12px] leading-relaxed opacity-40 mb-4">
        Faders ride the show, pads cue presets and dyes, buttons fire the one-shots. Pick a factory map or teach your controller: choose what a control should do, then touch it.
        Or teach it to the music with the note beside Learn: a slider follows a drum or a band, a button fires on its hits.
        Both are kept in the same map and the same file.
      </p>

      {!midi.supported && (
        <p className="text-[12px] leading-relaxed text-amber-200/80 mb-4" data-testid="midi-unsupported">
          This browser has no Web MIDI. Chrome, Edge and Opera have it; Safari and Firefox do not.
        </p>
      )}

      {/* Enable + devices */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => (midi.enabled ? midi.disable() : midi.enable())}
          disabled={!midi.supported}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-medium disabled:opacity-30 ${midi.enabled ? 'bg-white text-black' : 'bg-white/10 border border-white/10'}`}
          data-testid="midi-enable"
        >
          <Radio size={14} /> {midi.enabled ? 'MIDI on' : 'Turn MIDI on'}
        </button>
        <span className={`h-2.5 w-2.5 rounded-full ${midi.lastEvent && performance.now() - midi.lastEvent.at < 400 ? 'bg-emerald-400' : midi.enabled ? 'bg-white/20' : 'bg-white/5'}`} title="Activity" data-testid="midi-activity" />
      </div>
      {midi.error && <p className="text-[12px] text-red-300 mb-3" data-testid="midi-error">{midi.error}</p>}
      {midi.enabled && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="text-[12px] text-white/50">In
            <select value={midi.ports.input} onChange={e => midi.choosePorts({ input: e.target.value })} className={inputCls} data-testid="midi-input">
              <option value="all">All devices</option>
              {midi.inputs.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label className="text-[12px] text-white/50">LEDs
            <select value={midi.ports.output} onChange={e => midi.choosePorts({ output: e.target.value })} className={inputCls} data-testid="midi-output">
              <option value="auto">Auto</option>
              <option value="off">Off</option>
              {midi.outputs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          {midi.inputs.length === 0 && <p className="col-span-2 text-[12px] text-white/40">No controller found. Plug one in; it appears here by itself.</p>}
          {midi.lastEvent && <p className="col-span-2 text-[11px] font-mono text-white/40" data-testid="midi-last">Last: {sourceLabel(midi.lastEvent.source)} = {midi.lastEvent.value}</p>}
        </div>
      )}

      {/* Map: name, factory, file */}
      <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
        <input value={midi.map.name} onChange={e => midi.rename(e.target.value)} className={`${inputCls} mb-2`} placeholder="Map name" data-testid="midi-map-name" />
        <div className="flex flex-wrap gap-1.5 mb-2">
          {/* One list, in `midi.ts`, so the settings panel's chips and these
              cannot come to hold different sets of controllers. */}
          {FACTORY_MAPS.map(f => (
            <button
              key={f.id}
              onClick={() => midi.loadFactory(f.id)}
              className={chip(detected?.id === f.id)}
              title={detected?.id === f.id ? `${f.name} is what is plugged in` : undefined}
              data-testid={`midi-factory-${f.id}`}
            >
              {f.name}
            </button>
          ))}
          <button onClick={midi.clearMap} className={chip(false)} title="Remove every binding"><Trash2 size={11} className="inline -mt-0.5" /> Clear</button>
        </div>

        {/*
          Auto-map: for the controller nobody wrote a factory map for.

          Which is most of them. The five above are the ones somebody read the
          manual for; everything else meant MIDI learn, one control at a time,
          forty times, in a venue, before doors. This watches what the hardware
          sends and works the surface out from the shape of the messages, so it
          needs no device list and nothing to be kept up to date.

          It says so when a factory map exists, because a factory map is better
          than anything that can be worked out by listening: it knows which pads
          are a grid and where the master fader is, and this can only guess.
        */}
        {midi.enabled && (
          midi.watched ? (
            <div className="mb-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5" data-testid="midi-auto-listening">
              <p className="text-[13px] font-medium text-amber-100">Listening</p>
              <p className="mt-1 text-[12px] leading-relaxed text-amber-100/80">
                Sweep every fader and knob end to end, then press each pad and button you want to use.
                Nothing reaches the show while this is listening.
              </p>
              <p className="mt-1.5 font-mono text-[11px] text-amber-100" data-testid="midi-auto-tally">
                {midi.watched.continuous} faders · {midi.watched.encoder} encoders · {midi.watched.button} buttons
              </p>
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() => {
                    const said = midi.finishAutoMap(midi.activeInputName);
                    setAutoSaid(said
                      ? `${said.rides} rides${said.banks ? ` over ${said.banks + 1} layers` : ''} · ${said.presets} presets · ${said.dyes} dyes · ${said.actions} buttons`
                      : 'Nothing was touched, so nothing was changed.');
                  }}
                  className={`${chip(true)} flex-1`}
                  data-testid="midi-auto-finish"
                >
                  Map them
                </button>
                <button onClick={() => { midi.cancelAutoMap(); setAutoSaid(null); }} className={chip(false)} data-testid="midi-auto-cancel">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setAutoSaid(null); midi.startAutoMap(); }}
              className={`${chip(false)} mb-2 w-full`}
              title={detected
                ? `${detected.name} has a factory map, which knows the hardware better than listening can — but this works too`
                : 'Watch what this controller sends and build a map from it'}
              data-testid="midi-auto-start"
            >
              <Wand2 size={11} className="inline -mt-0.5 mr-1" />
              Auto-map this controller
            </button>
          )
        )}
        {autoSaid && (
          <p className="mb-2 text-[12px] text-emerald-200/90" data-testid="midi-auto-said">{autoSaid}</p>
        )}
        <div className="flex gap-1.5">
          <button onClick={midi.exportMap} className={`${chip(false)} flex-1`} data-testid="midi-export"><Download size={11} className="inline -mt-0.5 mr-1" />Save file</button>
          <button onClick={() => fileRef.current?.click()} className={`${chip(false)} flex-1`} data-testid="midi-import"><FolderOpen size={11} className="inline -mt-0.5 mr-1" />Load file</button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" data-testid="midi-file"
            onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              setFileError(null);
              try { await midi.importFile(f); } catch (err) { setFileError(err instanceof Error ? err.message : 'Could not read that file.'); }
            }} />
        </div>
        <button
          onClick={() => setShowSurface(true)}
          className={`${chip(false)} w-full mt-1.5 flex items-center justify-center gap-1.5`}
          title="The controller drawn to scale: assign by touching a control, and keep the picture as a cheat sheet"
          data-testid="midi-surface-open"
        >
          <LayoutGrid size={11} /> {surface.name} picture
        </button>
        {fileError && <p className="text-[12px] text-red-300 mt-2" data-testid="midi-file-error">{fileError}</p>}
        <p className="text-[11px] text-white/40 mt-2" data-testid="midi-binding-count">
          {midi.map.bindings.length} bindings{midi.map.sound?.length ? ` · ${midi.map.sound.length} to the music` : ''}{midi.map.device ? ` · made on ${midi.map.device}` : ''}
        </p>
      </div>

      {/* The shift layer */}
      {midi.enabled && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] text-white/50">Bank</span>
            <span className="font-mono text-[11px] text-white/35" data-testid="midi-bank-count">
              {midi.map.bindings.filter(b => b.bank !== undefined).length} on a layer
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: midi.banks }, (_, i) => (
              <button
                key={i}
                onClick={() => midi.setBank(i)}
                data-testid={`midi-bank-${i}`}
                title={i === 0 ? 'The base layer: bindings here are live on every bank' : `Shift layer ${i + 1}`}
                className={`${chip(midi.bank === i)} min-h-9`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
            Nine faders cannot reach forty settings. Learn a control while a layer is chosen and it belongs to that layer;
            learn it on <span className="text-white/60">1</span> and it is live on all of them, which is where presets, dyes and the transport belong.
            Put <span className="text-white/60">Bank +</span> on a button to step them in the dark.
            Changing layer drops every fader out of soft takeover, so nothing jumps to where the hardware happens to be standing.
          </p>
        </div>
      )}

      {/*
        What the controller is doing, on the desk.

        The desk shows six rides, and a controller can reach ninety settings —
        so riding one of the other eighty-four meant either spending a ride
        slot on it or riding blind. This puts a running list of what changed
        and where it landed in the corner instead.
      */}
      <label className="mb-3 flex items-center gap-2 text-[12px]" data-testid="midi-activity-toggle">
        <input type="checkbox" checked={activity} onChange={e => onActivity(e.target.checked)} />
        Show what the controller is doing, on the desk
      </label>

      {/* Fader manners */}
      <div className="flex items-center gap-2 mb-4 text-[12px]">
        <label
          className="flex items-center gap-1.5 flex-1"
          title="A fader does nothing until it passes through the value the setting is already at, so one left at the top does not slam the look back the moment it twitches — after a preset loads, or after a bank change hands it a different setting. The cost is that a fader out of position waits, and the activity readout says which one and what it is waiting for. Turn this off and every fader takes hold the instant it moves."
        ><input type="checkbox" checked={midi.softTakeover} onChange={e => midi.setSoftTakeover(e.target.checked)} data-testid="midi-soft" /> Soft takeover</label>
        <label className="flex items-center gap-1.5 flex-1" title="Learn the next setting as an endless encoder (relative nudges)"><input type="checkbox" checked={encoder} onChange={e => setEncoder(e.target.checked)} data-testid="midi-encoder" /> <Zap size={10} /> Endless encoder</label>
      </div>

      {/* Learn targets */}
      <div className="flex gap-1 mb-3">
        {(['settings', 'actions', 'presets', 'dyes'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`${chip(tab === t)} flex-1`} data-testid={`midi-tab-${t}`}>{t}</button>
        ))}
      </div>
      {midi.learning && (
        <p className="text-[12px] text-amber-200 mb-2 animate-pulse" data-testid="midi-learning">Move or press the control for “{targetLabel(midi.learning.target, presetName)}”…</p>
      )}
      <div className="mb-6" data-testid="midi-targets">
        {tab === 'settings' && LEARNABLE_SETTINGS.map(s => learnButton({ kind: 'setting', key: s.key, min: s.min, max: s.max }, s.label, `setting-${String(s.key)}`))}
        {tab === 'actions' && (Object.keys(ACTION_LABELS) as MidiAction[]).map(a => learnButton({ kind: 'action', action: a }, ACTION_LABELS[a], `action-${a}`))}
        {tab === 'presets' && presets.map(p => learnButton({ kind: 'preset', presetId: p.id }, p.name, `preset-${p.id}`))}
        {tab === 'dyes' && PALETTE.map((c, i) => learnButton({ kind: 'dye', paletteIndex: i }, c.name, `dye-${i}`))}
      </div>

      {/* Bindings */}
      <h3 className="text-[12px] text-white/50 mb-2">Bindings</h3>
      <div data-testid="midi-bindings">
        {midi.map.bindings.length === 0 && !midi.map.sound?.length && <p className="text-[12px] text-white/40">None yet.</p>}
        {midi.map.bindings.map(b => (
          <div key={b.id} className={`flex items-center gap-2 py-1 border-b border-white/5 text-[12px] ${b.bank !== undefined && b.bank !== midi.bank ? 'opacity-40' : ''}`} data-testid="midi-binding">
            <span className="font-mono text-white/50 w-24 shrink-0">{sourceLabel(b.source)}</span>
            <span className="flex-1 truncate">{targetLabel(b.target, presetName)}</span>
            {b.target.kind === 'setting' && b.source.kind === 'cc' && (
              <button onClick={() => midi.setBindingMode(b.id, b.mode === 'relative' ? 'absolute' : 'relative')} className="text-[8px] uppercase text-white/40 hover:text-white" title="Absolute fader or endless encoder">{b.mode === 'relative' ? 'enc' : 'abs'}</button>
            )}
            <button
              onClick={() => midi.setBindingBank(b.id, b.bank === undefined ? 1 : b.bank + 1 >= midi.banks ? undefined : b.bank + 1)}
              className="w-8 shrink-0 text-[8px] uppercase text-white/40 hover:text-white"
              title="Which shift layer this binding answers on — 'all' is every one"
            >
              {b.bank === undefined ? 'all' : `bk${b.bank + 1}`}
            </button>
            <button onClick={() => midi.removeBinding(b.id)} className="p-1 text-white/40 hover:text-red-300" aria-label="Remove binding"><Trash2 size={11} /></button>
          </div>
        ))}
        {/* What the music is bound to, in the same list: one set of bindings, whichever hand is on them. */}
        {(midi.map.sound ?? []).map(b => (
          <div key={b.id} className="flex items-center gap-2 py-1 border-b border-white/5 text-[12px]" data-testid={`sound-binding-${b.id}`}>
            <span className="w-28 shrink-0 truncate font-mono text-amber-100/80" title={MUSIC_SOURCE_LABELS[b.source]}>{'♪'} {MUSIC_SOURCE_LABELS[b.source]}</span>
            <span className="flex-1 truncate">{targetLabel(b.target, presetName)}</span>
            <span className="shrink-0 font-mono text-[11px] text-white/60">{isMapping(b) ? depthLabel(b.depth) : 'on hit'}</span>
            <button
              onClick={() => midi.removeSound(b.id)}
              className="flex h-6 w-6 shrink-0 items-center justify-center text-white/40 hover:text-red-300"
              aria-label="Remove binding"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
      </div>
    </Sheet>
  );
}
