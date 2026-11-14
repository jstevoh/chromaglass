import { Sliders, Trash2 } from 'lucide-react';
import { FACTORY_MAPS, sourceLabel, targetLabel, type FactoryMapId } from '../../lib/midi';
import { VOICE_DEFAULTS, type VoiceTool } from '../../lib/noteVoices';
import { DEFAULT_LIQUID_TYPES } from '../../types';
import { PRESETS, livePresetId } from '../../presets';
import { groupOf } from '../../lib/settingsMap';
import { Info } from '../Info';
import { LIT } from '../ui';
import type { SectionCtx } from './props';

/*
  Feed: the controller, its ports, its factory maps and auto-map.

  Each section is the markup that sat inline in `SettingsPanel`'s `sections` tree,
  moved verbatim (PLAN 19ai-9): its `{keep(id) && (<section ...>)}` is unchanged, so
  a desk panel, the Stage sheet and the full sheet draw it exactly as before, and
  it takes the panel's props and locals as one object (`SectionCtx`, in
  `props.ts`), destructuring only the names its markup reads. `npm run panel`
  reads this file with the panel (`scripts/settingsSource.mjs`).
*/
export const MidiSection = ({ c }: { c: SectionCtx }) => {
  const { focusSection, midi, onOpenMidi, keep, shown, detectedFactory, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* ── Controller ───────────────────────────────────── */}
      {/*
        MIDI, back where it can be found.

        The app has had factory maps for five controllers, a learn mode, soft
        takeover, shift banks and LED feedback for a long time, and a picture
        of your controller drawn to scale. On a desktop none of it was reachable
        except through ⌘K, because the button that opened it lived in the
        narrow-screen toolbar the desks replaced. The answer to "how do I set up
        my APC40" was a keyboard shortcut you had to already know.

        So: the three things that get a controller working — on, which port,
        which map — are here, and the port's own name is used to offer the
        right map as one button. Everything past that (learn, banks, bindings,
        the picture) is still the panel, one click away.
      */}
      {keep('midi') && (
      <section id="settings-midi" className={`${CARD} ${shown('midi') ? GRID : 'hidden'} ${focusSection === 'midi' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('midi')} data-section="midi">
        <h3 className={TITLE}>
          <Sliders size={12} /> Controller
        </h3>
        {!midi ? (
          <p className="text-[11px] text-white/40">The controller is not available in this window.</p>
        ) : !midi.supported ? (
          <p className="text-[11px] leading-relaxed text-amber-200/80" data-testid="settings-midi-unsupported">
            This browser has no Web MIDI. Chrome, Edge and Opera have it; Safari and Firefox do not.
          </p>
        ) : (
          <>
            <button
              aria-pressed={midi.enabled}
              onClick={() => (midi.enabled ? midi.disable() : midi.enable())}
              className={`mb-3 w-full rounded-lg py-2.5 text-[13px] font-medium transition-colors ${
                midi.enabled ? `border ${LIT}` : 'border border-white/10 hover:bg-white/10'
              }`}
              data-testid="settings-midi-enable"
            >
              {midi.enabled ? 'MIDI is on' : 'Turn MIDI on'}
            </button>
            {midi.error && <p className="mb-3 text-[12px] text-red-300" data-testid="settings-midi-error">{midi.error}</p>}

            {midi.enabled && (
              <>
                <div className="mb-3 flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-text">Controller</span>
                  <select
                    value={midi.ports.input}
                    onChange={e => midi.choosePorts({ input: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
                    data-testid="settings-midi-input"
                  >
                    <option value="all">All devices</option>
                    {midi.inputs.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  {midi.inputs.length === 0 && (
                    <p className="text-[12px] text-white/40" data-testid="settings-midi-none">
                      Nothing plugged in yet. Connect the controller by USB — it appears here by itself.
                    </p>
                  )}
                </div>
                {/* The port out, for the pads' LEDs: the MIDI sheet used to draw this next to the port in. */}
                <div className="mb-3 flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-text">LEDs</span>
                  <select
                    value={midi.ports.output}
                    onChange={e => midi.choosePorts({ output: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
                    data-testid="settings-midi-output"
                  >
                    <option value="auto">Auto</option>
                    <option value="off">Off</option>
                    {midi.outputs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>

                {/*
                  The one-click setup. `factoryFor` reads the port's own name,
                  so an APC40 mkII offers the APC40 map and nothing else has to
                  be known or guessed.
                */}
                {detectedFactory && (
                  <button
                    onClick={() => midi.loadFactory(detectedFactory.id)}
                    className="mb-3 w-full rounded-lg border border-emerald-400/40 bg-emerald-500/15 py-2.5 text-[13px] font-medium text-emerald-100 transition-colors hover:bg-emerald-500/25"
                    data-testid="settings-midi-setup"
                  >
                    Set up the {detectedFactory.name}
                  </button>
                )}
                <div className="mb-3 flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-text">
                    {detectedFactory ? 'Or another map' : 'Factory map'}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {FACTORY_MAPS.map(f => (
                      <button
                        key={f.id}
                        onClick={() => midi.loadFactory(f.id as FactoryMapId)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/10"
                        data-testid={`settings-midi-factory-${f.id}`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
                {/*
                  Auto-map, for the controller nobody wrote a factory map for —
                  which is most of them. The full flow lives in the MIDI panel;
                  this is the same button where someone setting a controller up
                  is already standing.
                */}
                {midi.watched ? (
                  <div className="mb-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5">
                    <p className="text-[13px] font-medium text-amber-100">Listening</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-amber-100/80">
                      Sweep every fader and knob, then press each pad and button. Nothing reaches the show meanwhile.
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] text-amber-100" data-testid="settings-midi-auto-tally">
                      {midi.watched.continuous} faders · {midi.watched.encoder} encoders · {midi.watched.button} buttons
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={() => midi.finishAutoMap(midi.activeInputName)}
                        className="flex-1 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-black"
                        data-testid="settings-midi-auto-finish"
                      >
                        Map them
                      </button>
                      <button
                        onClick={() => midi.cancelAutoMap()}
                        className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-white/70"
                        data-testid="settings-midi-auto-cancel"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => midi.startAutoMap()}
                    className="mb-3 w-full rounded-lg border border-white/15 bg-white/5 py-2.5 text-[13px] font-medium transition-colors hover:bg-white/10"
                    title="Watch what this controller sends and build a map from it — for hardware with no factory map, which is most of it"
                    data-testid="settings-midi-auto"
                  >
                    Auto-map this controller…
                  </button>
                )}
                <button
                  aria-pressed={midi.learning?.target.kind === 'voices'}
                  onClick={() => (
                    midi.learning?.target.kind === 'voices'
                      ? midi.cancelLearn()
                      : midi.learn({ kind: 'voices', tool: 'dropper', attack: VOICE_DEFAULTS.attack, release: VOICE_DEFAULTS.release, cap: VOICE_DEFAULTS.cap })
                  )}
                  className={`mb-3 w-full rounded-lg border py-2 text-[12px] font-medium transition-colors ${
                    midi.learning?.target.kind === 'voices' ? LIT : 'border-white/15 bg-white/5 hover:bg-white/10'
                  }`}
                  title="Play any note on a MIDI channel to make that channel’s notes drop and pour on the plate"
                  data-testid="settings-midi-voices-learn"
                  data-midi-key="voices"
                >
                  {midi.learning?.target.kind === 'voices' ? 'Play a note on the channel…' : 'Learn a channel as Notes as voices…'}
                </button>
                <p className="mb-3 text-[12px] text-white/40" data-testid="settings-midi-state">
                  {midi.map.bindings.length} bindings · {midi.activeInputName ?? 'no device'}
                  {midi.clocked ? ' · clock arriving' : ''}
                </p>
              </>
            )}

            {midi.map.bindings.length > 0 && (
              <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px]" data-testid="settings-midi-bindings">
                {midi.map.bindings.map(b => (
                  <div key={b.id} className="py-1 border-b border-white/5 last:border-b-0" data-testid="settings-midi-binding" data-midi-key={b.target.kind === 'voices' ? 'voices' : undefined}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-white/60 shrink-0">{b.target.kind === 'voices' ? `Ch ${b.source.channel + 1}` : sourceLabel(b.source)}</span>
                      <span className="truncate text-white/80 flex-1 text-right">{targetLabel(b.target, (id) => PRESETS.find(p => p.id === livePresetId(id))?.name)}</span>
                      {b.target.kind === 'voices' && (
                        <button onClick={() => midi.removeBinding(b.id)} className="p-1 text-white/40 hover:text-red-300" aria-label="Remove binding"><Trash2 size={11} /></button>
                      )}
                    </div>
                    {b.target.kind === 'voices' && (() => {
                      const vt = b.target;
                      return (
                        <div className="mt-1.5 flex flex-col gap-1.5 rounded border border-white/10 bg-black/30 p-2" data-testid={`settings-midi-voices-${b.id}`}>
                          <div className="flex items-center gap-2">
                            <label className="flex flex-1 items-center gap-1 text-[11px] text-white/60">
                              Tool
                              <select
                                value={vt.tool ?? 'dropper'}
                                aria-label="Voice tool"
                                onChange={e => midi.updateBinding(b.id, { ...vt, tool: e.target.value as VoiceTool })}
                                className="min-h-6 flex-1 rounded border border-white/10 bg-black/40 px-1 py-0.5 text-[11px] text-white outline-none"
                                data-testid={`settings-midi-voices-tool-${b.id}`}
                              >
                                <option value="dropper">Drop</option>
                                <option value="pour">Pour</option>
                                <option value="spray">Spray</option>
                                <option value="splatter">Splatter</option>
                              </select>
                            </label>
                            <label className="flex flex-1 items-center gap-1 text-[11px] text-white/60">
                              Liquid
                              <select
                                value={vt.liquid ?? ''}
                                aria-label="Voice liquid"
                                onChange={e => midi.updateBinding(b.id, { ...vt, liquid: e.target.value || undefined })}
                                className="min-h-6 flex-1 rounded border border-white/10 bg-black/40 px-1 py-0.5 text-[11px] text-white outline-none"
                                data-testid={`settings-midi-voices-liquid-${b.id}`}
                              >
                                <option value="">Look’s own</option>
                                {DEFAULT_LIQUID_TYPES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                              </select>
                            </label>
                          </div>
                          {([
                            ['attack', 'Attack', 0, 2, 0.05, vt.attack ?? VOICE_DEFAULTS.attack, (v: number) => `${v.toFixed(2)} s`],
                            ['release', 'Release', 0, 4, 0.05, vt.release ?? VOICE_DEFAULTS.release, (v: number) => `${v.toFixed(2)} s`],
                            ['cap', 'Voices', 1, 8, 1, vt.cap ?? VOICE_DEFAULTS.cap, (v: number) => `${Math.round(v)}`],
                          ] as const).map(([k, lbl, min, max, step, val, fmt]) => (
                            <label key={k} className="flex items-center gap-2 text-[11px] text-white/60">
                              <span className="w-12 shrink-0">{lbl}</span>
                              <input
                                type="range" min={min} max={max} step={step} value={val}
                                aria-label={lbl}
                                onChange={e => midi.updateBinding(b.id, { ...vt, [k]: Number(e.target.value) })}
                                className="set-range flex-1"
                                data-testid={`settings-midi-voices-${k}-${b.id}`}
                              />
                              <span className="w-11 text-right font-mono text-[11px] text-white/80">{fmt(val)}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}

            {onOpenMidi && (
              <button
                onClick={onOpenMidi}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 text-[13px] font-medium transition-colors hover:bg-white/10"
                title="Learn a control, shift banks, the bindings list, and your controller drawn to scale"
                data-testid="settings-midi-open"
              >
                Learn controls, banks and bindings…
              </button>
            )}
            <Info>
              An APC40 mkII is the classic desk for this: nine faders ride the show, the 8×5 grid cues looks, and the
              transport row fires the one-shots. Plug it in, turn MIDI on, take the setup button — then the panel above
              to teach it anything else. Bank + on a button reaches the settings nine faders cannot.
            </Info>
          </>
        )}
      </section>
      )}
    </>
  );
};
