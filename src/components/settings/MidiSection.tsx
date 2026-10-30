import { Sliders } from 'lucide-react';
import { FACTORY_MAPS, type FactoryMapId } from '../../lib/midi';
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
                <p className="mb-3 text-[12px] text-white/40" data-testid="settings-midi-state">
                  {midi.map.bindings.length} bindings · {midi.activeInputName ?? 'no device'}
                  {midi.clocked ? ' · clock arriving' : ''}
                </p>
              </>
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
