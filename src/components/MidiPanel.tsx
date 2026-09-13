import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Sliders, Download, FolderOpen, Trash2, Radio, Zap } from 'lucide-react';
import { ACTION_LABELS, LEARNABLE_SETTINGS, sourceLabel, targetLabel, type MidiAction, type MidiTarget } from '../lib/midi';
import type { MidiController } from '../hooks/useMidi';
import { PALETTE } from '../constants';

/**
 * The MIDI panel: turn the controller on, pick a factory map or teach it
 * (choose what a control should do, then touch the control), and keep the
 * result as a file so the next laptop learns it in one click.
 */
interface MidiPanelProps {
  midi: MidiController;
  presets: { id: string; name: string }[];
  onClose: () => void;
}

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40';
const chip = (active: boolean) => `px-2.5 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-colors ${active ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'}`;

export function MidiPanel({ midi, presets, onClose }: MidiPanelProps) {
  const [tab, setTab] = useState<'settings' | 'actions' | 'presets' | 'dyes'>('settings');
  const [encoder, setEncoder] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const presetName = (id: string) => presets.find(p => p.id === id)?.name;

  const learnButton = (target: MidiTarget, label: string, key: string) => {
    const isLearning = midi.learning && JSON.stringify(midi.learning.target) === JSON.stringify(target);
    const bound = midi.map.bindings.filter(b => JSON.stringify(b.target) === JSON.stringify(target));
    return (
      <div key={key} className="flex items-center gap-2 py-1 border-b border-white/5" data-testid={`midi-target-${key}`}>
        <span className="flex-1 text-[11px] truncate">{label}</span>
        <span className="text-[9px] font-mono text-white/40 truncate max-w-[40%]">{bound.map(b => sourceLabel(b.source)).join(', ')}</span>
        <button
          onClick={() => (isLearning ? midi.cancelLearn() : midi.learn(target, encoder && target.kind === 'setting' ? 'relative' : 'absolute'))}
          disabled={!midi.enabled}
          className={`px-2 py-1 rounded-md border text-[9px] font-bold uppercase tracking-wider disabled:opacity-30 ${isLearning ? 'bg-amber-400 text-black border-amber-400 animate-pulse' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
          data-testid={`midi-learn-${key}`}
        >
          {isLearning ? 'Touch it…' : 'Learn'}
        </button>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ x: '-100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed top-0 left-0 w-80 h-full bg-black/80 backdrop-blur-xl border-r border-white/10 z-40 overflow-y-auto p-8 pt-28 scrollbar-hide text-white"
      data-testid="midi-panel"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold tracking-tighter flex items-center gap-2"><Sliders size={18} /> MIDI</h2>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors" aria-label="Close MIDI">
          <X size={20} />
        </button>
      </div>
      <p className="text-[10px] leading-relaxed opacity-40 mb-4">
        Faders ride the show, pads cue presets and dyes, buttons fire the one-shots. Pick a factory map or teach your controller: choose what a control should do, then touch it.
      </p>

      {!midi.supported && (
        <p className="text-[10px] leading-relaxed text-amber-200/80 mb-4" data-testid="midi-unsupported">
          This browser has no Web MIDI. Chrome, Edge and Opera have it; Safari and Firefox do not.
        </p>
      )}

      {/* Enable + devices */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => (midi.enabled ? midi.disable() : midi.enable())}
          disabled={!midi.supported}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest disabled:opacity-30 ${midi.enabled ? 'bg-white text-black' : 'bg-white/10 border border-white/10'}`}
          data-testid="midi-enable"
        >
          <Radio size={14} /> {midi.enabled ? 'MIDI on' : 'Turn MIDI on'}
        </button>
        <span className={`h-2.5 w-2.5 rounded-full ${midi.lastEvent && performance.now() - midi.lastEvent.at < 400 ? 'bg-emerald-400' : midi.enabled ? 'bg-white/20' : 'bg-white/5'}`} title="Activity" data-testid="midi-activity" />
      </div>
      {midi.error && <p className="text-[10px] text-red-300 mb-3" data-testid="midi-error">{midi.error}</p>}
      {midi.enabled && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="text-[9px] uppercase tracking-widest text-white/50">In
            <select value={midi.ports.input} onChange={e => midi.choosePorts({ input: e.target.value })} className={inputCls} data-testid="midi-input">
              <option value="all">All devices</option>
              {midi.inputs.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label className="text-[9px] uppercase tracking-widest text-white/50">LEDs
            <select value={midi.ports.output} onChange={e => midi.choosePorts({ output: e.target.value })} className={inputCls} data-testid="midi-output">
              <option value="auto">Auto</option>
              <option value="off">Off</option>
              {midi.outputs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          {midi.inputs.length === 0 && <p className="col-span-2 text-[10px] text-white/40">No controller found. Plug one in; it appears here by itself.</p>}
          {midi.lastEvent && <p className="col-span-2 text-[9px] font-mono text-white/40" data-testid="midi-last">Last: {sourceLabel(midi.lastEvent.source)} = {midi.lastEvent.value}</p>}
        </div>
      )}

      {/* Map: name, factory, file */}
      <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
        <input value={midi.map.name} onChange={e => midi.rename(e.target.value)} className={`${inputCls} mb-2`} placeholder="Map name" data-testid="midi-map-name" />
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button onClick={() => midi.loadFactory('apc-mini-mk2')} className={chip(false)} data-testid="midi-factory-apc">APC mini mk2</button>
          <button onClick={() => midi.loadFactory('nanokontrol2')} className={chip(false)} data-testid="midi-factory-nano">nanoKONTROL2</button>
          <button onClick={() => midi.loadFactory('apc40-mk2')} className={chip(false)} data-testid="midi-factory-apc40">APC40 mkII</button>
          <button onClick={() => midi.loadFactory('launchpad')} className={chip(false)} data-testid="midi-factory-launchpad">Launchpad</button>
          <button onClick={() => midi.loadFactory('launch-control-xl')} className={chip(false)} data-testid="midi-factory-lcxl">Launch Control XL</button>
          <button onClick={midi.clearMap} className={chip(false)} title="Remove every binding"><Trash2 size={11} className="inline -mt-0.5" /> Clear</button>
        </div>
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
        {fileError && <p className="text-[10px] text-red-300 mt-2" data-testid="midi-file-error">{fileError}</p>}
        <p className="text-[9px] text-white/40 mt-2" data-testid="midi-binding-count">{midi.map.bindings.length} bindings{midi.map.device ? ` · made on ${midi.map.device}` : ''}</p>
      </div>

      {/* Fader manners */}
      <div className="flex items-center gap-2 mb-4 text-[10px]">
        <label className="flex items-center gap-1.5 flex-1"><input type="checkbox" checked={midi.softTakeover} onChange={e => midi.setSoftTakeover(e.target.checked)} data-testid="midi-soft" /> Soft takeover</label>
        <label className="flex items-center gap-1.5 flex-1" title="Learn the next setting as an endless encoder (relative nudges)"><input type="checkbox" checked={encoder} onChange={e => setEncoder(e.target.checked)} data-testid="midi-encoder" /> <Zap size={10} /> Endless encoder</label>
      </div>

      {/* Learn targets */}
      <div className="flex gap-1 mb-3">
        {(['settings', 'actions', 'presets', 'dyes'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`${chip(tab === t)} flex-1`} data-testid={`midi-tab-${t}`}>{t}</button>
        ))}
      </div>
      {midi.learning && (
        <p className="text-[10px] text-amber-200 mb-2 animate-pulse" data-testid="midi-learning">Move or press the control for “{targetLabel(midi.learning.target, presetName)}”…</p>
      )}
      <div className="mb-6" data-testid="midi-targets">
        {tab === 'settings' && LEARNABLE_SETTINGS.map(s => learnButton({ kind: 'setting', key: s.key, min: s.min, max: s.max }, s.label, `setting-${String(s.key)}`))}
        {tab === 'actions' && (Object.keys(ACTION_LABELS) as MidiAction[]).map(a => learnButton({ kind: 'action', action: a }, ACTION_LABELS[a], `action-${a}`))}
        {tab === 'presets' && presets.map(p => learnButton({ kind: 'preset', presetId: p.id }, p.name, `preset-${p.id}`))}
        {tab === 'dyes' && PALETTE.map((c, i) => learnButton({ kind: 'dye', paletteIndex: i }, c.name, `dye-${i}`))}
      </div>

      {/* Bindings */}
      <h3 className="text-[9px] uppercase tracking-widest text-white/50 mb-2">Bindings</h3>
      <div data-testid="midi-bindings">
        {midi.map.bindings.length === 0 && <p className="text-[10px] text-white/40">None yet.</p>}
        {midi.map.bindings.map(b => (
          <div key={b.id} className="flex items-center gap-2 py-1 border-b border-white/5 text-[10px]" data-testid="midi-binding">
            <span className="font-mono text-white/50 w-24 shrink-0">{sourceLabel(b.source)}</span>
            <span className="flex-1 truncate">{targetLabel(b.target, presetName)}</span>
            {b.target.kind === 'setting' && b.source.kind === 'cc' && (
              <button onClick={() => midi.setBindingMode(b.id, b.mode === 'relative' ? 'absolute' : 'relative')} className="text-[8px] uppercase text-white/40 hover:text-white" title="Absolute fader or endless encoder">{b.mode === 'relative' ? 'enc' : 'abs'}</button>
            )}
            <button onClick={() => midi.removeBinding(b.id)} className="p-1 text-white/40 hover:text-red-300" aria-label="Remove binding"><Trash2 size={11} /></button>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
