import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, Play, Pause, Square, SkipBack, SkipForward, Plus, Trash2, Copy, ChevronUp, ChevronDown, Clapperboard } from 'lucide-react';
import { PRESETS } from '../presets';
import type { VisualizerSettings } from '../types';
import { ShowSequence, ShowStage, SequencerStatus, StageAdvance, stageId, duplicateSequence } from '../lib/sequencer';

/**
 * The show sequencer: a script for how the plate evolves over a song or a
 * set. Pick a sequence, press play, and the stages take the show from one
 * look to the next — or edit the stages and write your own.
 */

interface SequencerPanelProps {
  sequences: ShowSequence[];
  selectedId: string;
  onSelect: (id: string) => void;
  status: SequencerStatus;
  onPlay: (id?: string) => void;
  onPause: () => void;
  onStop: () => void;
  onNext: () => void;
  onPrev: () => void;
  onGoTo: (index: number) => void;
  onSave: (seq: ShowSequence) => void;
  onRemove: (id: string) => void;
  /** Whether the song's sections are known (section-advance stages need them). */
  hasSections: boolean;
  onClose: () => void;
}

/** The settings a stage may glide — the ones that read as a show changing, not a re-tune. */
const OVERRIDE_FIELDS: { key: keyof VisualizerSettings; label: string; min: number; max: number; step: number }[] = [
  { key: 'dyeBudget',       label: 'Dye Budget',       min: 0,    max: 1.5,  step: 0.05 },
  { key: 'turbulenceScale', label: 'Turbulence',       min: 0,    max: 1,    step: 0.05 },
  { key: 'audioImpact',     label: 'Audio Impact',     min: 0,    max: 1,    step: 0.05 },
  { key: 'globalSpeed',     label: 'Speed',            min: 0.005, max: 0.15, step: 0.005 },
  { key: 'plateRock',       label: 'Plate Rock',       min: 0,    max: 1,    step: 0.05 },
  { key: 'beatSqueeze',     label: 'Beat Squeeze',     min: 0,    max: 1,    step: 0.05 },
  { key: 'bubbles',         label: 'Bubbles',          min: 0,    max: 1,    step: 0.05 },
  { key: 'saturationBoost', label: 'Saturation',       min: 0.5,  max: 2,    step: 0.05 },
  { key: 'backgroundLoop',  label: 'Background Loop',  min: 0,    max: 1,    step: 0.05 },
  { key: 'kaleidoscope',    label: 'Kaleidoscope',     min: 0,    max: 6,    step: 2 },
  { key: 'dishVignette',    label: 'Round Dish',       min: 0,    max: 1,    step: 0.05 },
  { key: 'lightPlay',       label: 'Light Play',       min: 0,    max: 1,    step: 0.05 },
  { key: 'secondLamp',      label: 'Second Lamp',      min: 0,    max: 1,    step: 0.05 },
  { key: 'lampHotspot',     label: 'Hot-Spot',         min: 0,    max: 1,    step: 0.05 },
  { key: 'camera',          label: 'Camera',           min: 0,    max: 1,    step: 0.05 },
  { key: 'aperture',        label: 'Aperture',         min: 0,    max: 1,    step: 0.05 },
  { key: 'bloom',           label: 'Bloom',            min: 0,    max: 1,    step: 0.05 },
  { key: 'microDroplets',   label: 'Micro-droplets',   min: 0,    max: 1,    step: 0.05 },
  { key: 'thinFilm',        label: 'Thin Film',        min: 0,    max: 1,    step: 0.05 },
  { key: 'lumia',           label: 'Lumia',            min: 0,    max: 1,    step: 0.05 },
  { key: 'chemistry',       label: 'Chemistry',        min: 0,    max: 1,    step: 0.05 },
  { key: 'gelWheel',        label: 'Gel Wheel',        min: 0,    max: 1,    step: 0.05 },
  { key: 'macroZoom',       label: 'Macro Zoom',       min: 1,    max: 12,   step: 0.5 },
  { key: 'macroSync',       label: 'Macro Music Sync', min: 0,    max: 1,    step: 0.05 },
];

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 mb-3">
    <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{label}</span>
    {children}
  </label>
);

const inputCls = 'bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-white/40';

export const SequencerPanel: React.FC<SequencerPanelProps> = ({
  sequences, selectedId, onSelect, status, onPlay, onPause, onStop, onNext, onPrev, onGoTo, onSave, onRemove, hasSections, onClose,
}) => {
  const selected = useMemo(() => sequences.find(q => q.id === selectedId) ?? sequences[0], [sequences, selectedId]);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const isRunningThis = status.sequenceId === selected?.id;
  const editable = selected && !selected.builtIn;
  const stage = editable && editIndex !== null ? selected.stages[editIndex] : null;

  const update = (mutate: (seq: ShowSequence) => ShowSequence) => {
    if (!selected || selected.builtIn) return;
    onSave(mutate(selected));
  };
  const updateStage = (index: number, patch: Partial<ShowStage>) =>
    update(seq => ({ ...seq, stages: seq.stages.map((st, i) => (i === index ? { ...st, ...patch } : st)) }));
  const updateOverride = (index: number, key: keyof VisualizerSettings, value: number | undefined) =>
    update(seq => ({
      ...seq,
      stages: seq.stages.map((st, i) => {
        if (i !== index) return st;
        const next = { ...(st.settings ?? {}) } as Record<string, unknown>;
        if (value === undefined) delete next[key]; else next[key] = value;
        return { ...st, settings: next as Partial<VisualizerSettings> };
      }),
    }));
  const addStage = () => update(seq => ({
    ...seq,
    stages: [...seq.stages, { id: stageId(), name: `Stage ${seq.stages.length + 1}`, seconds: 60, advance: 'time' as StageAdvance, transition: 8 }],
  }));
  const removeStage = (index: number) => { update(seq => ({ ...seq, stages: seq.stages.filter((_, i) => i !== index) })); setEditIndex(null); };
  const moveStage = (index: number, dir: -1 | 1) => update(seq => {
    const j = index + dir;
    if (j < 0 || j >= seq.stages.length) return seq;
    const stages = [...seq.stages];
    [stages[index], stages[j]] = [stages[j], stages[index]];
    return { ...seq, stages };
  });
  const makeCopy = () => {
    if (!selected) return;
    const copy = duplicateSequence(selected);
    onSave(copy);
    onSelect(copy.id);
    setEditIndex(null);
  };
  const makeNew = () => {
    const seq: ShowSequence = {
      id: `seq-${Date.now().toString(36)}`, name: 'New sequence', loop: true, builtIn: false,
      stages: [{ id: stageId(), name: 'Opening', seconds: 60, advance: 'time', transition: 8, paletteSize: 1, paletteLead: 0 }],
    };
    onSave(seq);
    onSelect(seq.id);
    setEditIndex(0);
  };

  return (
    <motion.div
      initial={{ x: '-100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed top-0 left-0 w-80 h-full bg-black/80 backdrop-blur-xl border-r border-white/10 z-40 overflow-y-auto p-8 pt-28 scrollbar-hide"
      data-testid="sequencer-panel"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold tracking-tighter flex items-center gap-2"><Clapperboard size={18} /> Show Sequencer</h2>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors" aria-label="Close sequencer">
          <X size={20} />
        </button>
      </div>
      <p className="text-[10px] leading-relaxed opacity-40 mb-5">
        A script for the show instead of dice: stages that change the plate over a song or a set, each gliding into the next on a clock or when the song moves to a new section.
      </p>

      {/* Sequence picker */}
      <Field label="Sequence">
        <select value={selected?.id ?? ''} onChange={(e) => { onSelect(e.target.value); setEditIndex(null); }} className={inputCls} data-testid="seq-select">
          {sequences.map(q => <option key={q.id} value={q.id}>{q.name}{q.builtIn ? '' : ' ✎'}</option>)}
        </select>
      </Field>
      {selected?.description && <p className="text-[10px] leading-relaxed opacity-50 mb-4">{selected.description}</p>}

      {/* Transport */}
      <div className="flex items-center gap-2 mb-4" data-testid="seq-transport">
        <button onClick={onPrev} disabled={!isRunningThis} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30" title="Previous stage" data-testid="seq-prev"><SkipBack size={14} /></button>
        {isRunningThis && status.running ? (
          <button onClick={onPause} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-white text-black font-bold text-[10px] uppercase tracking-widest" data-testid="seq-pause"><Pause size={14} /> Pause</button>
        ) : (
          <button onClick={() => onPlay(selected?.id)} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-white text-black font-bold text-[10px] uppercase tracking-widest" data-testid="seq-play"><Play size={14} /> {isRunningThis ? 'Resume' : 'Play'}</button>
        )}
        <button onClick={onNext} disabled={!isRunningThis} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30" title="Next stage" data-testid="seq-next"><SkipForward size={14} /></button>
        <button onClick={onStop} disabled={status.sequenceId === null} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30" title="Stop the sequencer and hand the show back" data-testid="seq-stop"><Square size={14} /></button>
      </div>
      {status.sequenceId !== null && !isRunningThis && (
        <p className="text-[10px] opacity-50 mb-4">Running: {status.name} — stage {status.stageIndex + 1}, {status.stageName}</p>
      )}

      {/* Stage strip */}
      <div className="flex flex-col gap-1.5 mb-5" data-testid="seq-stages">
        {selected?.stages.map((st, i) => {
          const current = isRunningThis && status.stageIndex === i;
          const prog = current ? status.progress : 0;
          return (
            <button
              key={st.id}
              onClick={() => (isRunningThis ? onGoTo(i) : editable ? setEditIndex(editIndex === i ? null : i) : undefined)}
              className={`relative overflow-hidden text-left rounded-lg border px-3 py-2 transition-colors ${
                current ? 'border-white/60 bg-white/10' : editIndex === i && editable ? 'border-white/40 bg-white/5' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
              data-testid={`seq-stage-${i}`}
            >
              <span className="absolute inset-y-0 left-0 bg-white/15" style={{ width: `${prog * 100}%` }} />
              <span className="relative flex items-center justify-between gap-2">
                <span className="text-xs font-semibold truncate">{i + 1}. {st.name}</span>
                <span className="text-[9px] font-mono opacity-50 shrink-0">
                  {st.advance === 'section' ? 'section' : st.advance === 'hold' ? 'hold' : fmt(st.seconds)}
                  {st.presetId ? ` · ${PRESETS.find(p => p.id === st.presetId)?.name ?? st.presetId}` : ''}
                  {st.paletteSize ? ` · ${st.paletteSize} dye${st.paletteSize > 1 ? 's' : ''}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {selected?.stages.some(st => st.advance === 'section') && !hasSections && (
        <p className="text-[10px] leading-relaxed opacity-50 mb-4">
          Section stages wait for the song map from Track intelligence; until a track is identified they advance on their own clock.
        </p>
      )}

      {/* Sequence actions */}
      <div className="flex gap-2 mb-6">
        <button onClick={makeCopy} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest" title="Copy this sequence so you can edit it"><Copy size={12} /> Copy</button>
        <button onClick={makeNew} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest" title="Start a new sequence"><Plus size={12} /> New</button>
        {editable && (
          <button onClick={() => { onRemove(selected.id); setEditIndex(null); }} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-red-500/20 hover:border-red-400/40" title="Delete this sequence"><Trash2 size={12} /></button>
        )}
      </div>

      {/* Editor */}
      {editable && (
        <section className="mb-8">
          <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4">Edit</h3>
          <Field label="Name">
            <input value={selected.name} onChange={(e) => update(seq => ({ ...seq, name: e.target.value }))} className={inputCls} />
          </Field>
          <label className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Loop</span>
            <input type="checkbox" checked={selected.loop} onChange={(e) => update(seq => ({ ...seq, loop: e.target.checked }))} className="accent-white" />
          </label>
          <button onClick={addStage} className="w-full flex items-center justify-center gap-1.5 py-2 mb-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest"><Plus size={12} /> Add stage</button>
          {!stage && <p className="text-[10px] opacity-40">Tap a stage above to edit it.</p>}
          {stage && editIndex !== null && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold">Stage {editIndex + 1}</span>
                <span className="flex gap-1">
                  <button onClick={() => moveStage(editIndex, -1)} className="p-1 rounded hover:bg-white/10" title="Move up"><ChevronUp size={12} /></button>
                  <button onClick={() => moveStage(editIndex, 1)} className="p-1 rounded hover:bg-white/10" title="Move down"><ChevronDown size={12} /></button>
                  <button onClick={() => removeStage(editIndex)} className="p-1 rounded hover:bg-red-500/20" title="Remove stage"><Trash2 size={12} /></button>
                </span>
              </div>
              <Field label="Name">
                <input value={stage.name} onChange={(e) => updateStage(editIndex, { name: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Advance">
                <select value={stage.advance} onChange={(e) => updateStage(editIndex, { advance: e.target.value as StageAdvance })} className={inputCls}>
                  <option value="time">After a time</option>
                  <option value="section">When the song changes section</option>
                  <option value="hold">Hold until Next</option>
                </select>
              </Field>
              <Field label={stage.advance === 'section' ? 'Minimum seconds' : 'Seconds'}>
                <input type="number" min={1} max={3600} value={stage.seconds} onChange={(e) => updateStage(editIndex, { seconds: Math.max(1, Number(e.target.value) || 1) })} className={inputCls} />
              </Field>
              <Field label="Transition (seconds)">
                <input type="number" min={0} max={300} value={stage.transition} onChange={(e) => updateStage(editIndex, { transition: Math.max(0, Number(e.target.value) || 0) })} className={inputCls} />
              </Field>
              <Field label="Preset">
                <select value={stage.presetId ?? ''} onChange={(e) => updateStage(editIndex, { presetId: e.target.value || undefined })} className={inputCls}>
                  <option value="">Keep the current one</option>
                  {PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Dyes in play">
                  <select value={stage.paletteSize ?? ''} onChange={(e) => updateStage(editIndex, { paletteSize: e.target.value ? Number(e.target.value) : undefined })} className={inputCls}>
                    <option value="">All</option>
                    <option value="1">1 (mono)</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </Field>
                <Field label="Lead dye">
                  <input type="number" min={0} max={7} value={stage.paletteLead ?? 0} onChange={(e) => updateStage(editIndex, { paletteLead: Math.max(0, Number(e.target.value) || 0) })} className={inputCls} />
                </Field>
              </div>
              <Field label="Macro camera">
                <select value={stage.macro === undefined ? '' : stage.macro ? 'on' : 'off'} onChange={(e) => updateStage(editIndex, { macro: e.target.value === '' ? undefined : e.target.value === 'on' })} className={inputCls}>
                  <option value="">As the preset says</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </Field>
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-2 mt-2">Overrides</div>
              {OVERRIDE_FIELDS.map(f => {
                const v = stage.settings?.[f.key];
                const on = typeof v === 'number';
                return (
                  <div key={f.key} className="flex items-center gap-2 mb-2">
                    <input type="checkbox" checked={on} onChange={(e) => updateOverride(editIndex, f.key, e.target.checked ? (f.min + f.max) / 2 : undefined)} className="accent-white" title={`Glide ${f.label} in this stage`} />
                    <span className="text-[10px] w-24 shrink-0 opacity-70">{f.label}</span>
                    <input type="range" min={f.min} max={f.max} step={f.step} value={on ? (v as number) : f.min} disabled={!on} onChange={(e) => updateOverride(editIndex, f.key, parseFloat(e.target.value))} className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white disabled:opacity-30" />
                    <span className="text-[9px] font-mono opacity-50 w-8 text-right">{on ? (v as number).toFixed(2) : '—'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </motion.div>
  );
};
