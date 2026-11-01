import { Activity } from 'lucide-react';
import { isMapping } from '../../lib/midi';
import { groupOf } from '../../lib/settingsMap';
import { Info } from '../Info';
import { SwitchPill, Toggle, LIT } from '../ui';
import { TapPad } from '../ui/Playful';
import { OscOutRow } from '../ui/OscOutRow';
import { linkLine, tempoSourceName } from '../../lib/tempo';
import { Slider } from './controls';
import type { SectionCtx } from './props';

/*
  Feed: Sound, the section that was the longest on its own (the device, the room's
  calibration, the tempo and how the plate hears the music).

  Each section is the markup that sat inline in `SettingsPanel`'s `sections` tree,
  moved verbatim (PLAN 19ai-9): its `{keep(id) && (<section ...>)}` is unchanged, so
  a desk panel, the Stage sheet and the full sheet draw it exactly as before, and
  it takes the panel's props and locals as one object (`SectionCtx`, in
  `props.ts`), destructuring only the names its markup reads. `npm run panel`
  reads this file with the panel (`scripts/settingsSource.mjs`).
*/
export const AudioInputSection = ({ c }: { c: SectionCtx }) => {
  const {
    settings, onUpdate, songDetection, onSongDetection, calibration, onRecalibrate, audioSource,
    onAudioSource, audioInputs, audioInputId, onAudioInput, tempo, onTap, readTempo, onTempoClear,
    onTempoBpm, onLink, oscOut, onOscOut, midiClocked, timecode, focusSection, midi, onOpenSound, keep, shown, goTo, listens,
    CARD, GRID, TITLE,
  } = c;
  return (
    <>

      {/* Sound Section */}
      {keep('audio-input') && (
      <section id="settings-audio-input" className={`${CARD} ${shown('audio-input') ? GRID : 'hidden'} ${focusSection === 'audio-input' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('audio-input')} data-section="audio-input">
        <h3 className={TITLE}>
          <Activity size={12} /> Audio Input
        </h3>
        {/*
          Sound Drive: how hard the music moves the plate at all. First in
          Sound, which it joined with the rest of Sound Mappings (2026-10-10):
          on the desk Sound Mappings was a panel of this one knob.

          It is the headline ride — the first fader on every factory map and
          the one a hand is on through a chorus — and until now the only place
          it existed was the narrow-screen toolbar, which a desktop never
          draws. The panel that claims to hold every setting did not hold the
          most important one.
        */}
        <Slider
          label="Sound Drive"
          value={settings.audioImpact}
          min={0}
          max={1}
          step={0.01}
          icon={Activity}
          onChange={(v: number) => onUpdate({ audioImpact: v })}
          settingKey="audioImpact"
        />
        <Slider
          label="Sound Impact"
          disabled={!listens('sound') && !listens('bands') && !listens('hits') && !midi?.map.sound?.some(isMapping) && 'no patch reads the sound'}
          value={settings.soundImpact ?? 1}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ soundImpact: v })}
          settingKey="soundImpact"
        />
        <Slider
          label="Sensitivity"
          value={settings.sensitivity}
          min={0.1}
          max={3.0}
          step={0.1}
          onChange={(v: number) => onUpdate({ sensitivity: v })}
          settingKey="sensitivity"
        />
        <Slider
          label="Bass Boost"
          value={settings.bassBoost}
          min={0.25}
          max={5}
          step={0.1}
          onChange={(v: number) => onUpdate({ bassBoost: v })}
          settingKey="bassBoost"
        />

        {/*
          What is listening, said here and chosen in the Sound sheet.

          The five-way switch that stood here was the second drawing of the
          sheet's six, which also has the plate as an instrument; two homes
          meant one could be changed while the other was read. The sheet is
          the superset, so it is the home, and this row is the state and the
          way there. The device below stays: it is where the Mic dot lands.
        */}
        {onAudioSource && (
          <div className="mb-3.5 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text">Source</span>
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 flex-1 items-center rounded-lg border px-3 text-[13px] font-medium ${audioSource === 'none' ? 'border-white/10 bg-white/5 text-white/60' : LIT}`}
                role="status"
                data-testid="audio-source-state"
                data-source={audioSource}
              >
                {({ none: 'Off', microphone: 'Mic', system: 'System', file: 'File', simulated: 'Band', drone: 'Instrument' } as const)[audioSource]}
              </div>
              {onOpenSound && (
                <button
                  onClick={onOpenSound}
                  className="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-[12px] font-medium transition-colors hover:bg-white/10"
                  title="Choose what the plate listens to: the mic, a tab, a file, the band or the plate as an instrument"
                  data-testid="audio-source-open"
                >
                  Change in Sound…
                </button>
              )}
            </div>
            <Info>
              <b>Mic</b> hears the room. <b>System</b> captures a tab or the whole machine, so a stream drives the plate with no microphone in the loop. <b>File</b> plays a track here and is the straightest signal there is. <b>Band</b> is a synthesised group played silently into the analyser — no device, no permission, and every mapping runs exactly as it does on a real input.
            </Info>
          </div>
        )}

        {/* The input: a USB interface fed from the desk, not the laptop's own microphone */}
        {onAudioInput && (
          <div className="mb-3.5 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-text">Input</span>
            <select
              value={audioInputId}
              onChange={(e) => onAudioInput(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
              data-testid="audio-input"
            >
              <option value="">Default microphone</option>
              {audioInputs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <Info>
              On stage, ask the sound desk for an aux send into a USB audio interface and pick it here: a clean feed heavy on kick, snare and bass drives the plate better than a microphone hearing the room.
            </Info>
          </div>
        )}

        {/* Room calibration */}
        <div className="mb-3 mt-2">
          <Toggle
            label="Auto Calibrate"
            on={settings.autoCalibrate !== false}
            onChange={v => onUpdate({ autoCalibrate: v })}
            title="Learn this room's noise floor and dynamics, and drive the visuals from where the music sits between them"
            testId="auto-calibrate-toggle"
          />
        </div>
        {/* The beat, ahead of the microphone */}
        <Slider
          label="Beat Prediction"
          value={settings.beatPrediction ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ beatPrediction: v })}
          settingKey="beatPrediction"
        />
        <Slider
          label="Beat Lead"
          value={settings.beatLead ?? 0}
          min={0}
          max={250}
          step={5}
          onChange={(v: number) => onUpdate({ beatLead: v })}
          settingKey="beatLead"
        />
        <Info>
          A microphone hears late. Once the clock has locked onto the tempo, kicks fire from it, this many milliseconds ahead of the onset being heard; a breakdown or silence hands back to plain detection.
        </Info>

        {/* Somewhere to get the tempo from besides the microphone */}
        {onTap && (
          <div className="mb-4 mt-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-text">Tempo</span>
              <span className="font-mono text-[12px] opacity-50" data-testid="tempo-readout">
                {tempo?.source
                  ? `${tempo.bpm} bpm \u00b7 ${tempoSourceName(tempo.source)}`
                  : 'listening'}
              </span>
            </div>
            <div className="flex gap-1.5">
              <TapPad tempo={tempo} read={readTempo} onTap={onTap} />
              <button
                onClick={onTempoClear}
                disabled={!tempo?.source}
                data-testid="tempo-listen"
                title="Back to working the tempo out from what it can hear"
                className="min-h-9 flex-none rounded-lg border border-white/10 bg-white/5 px-3 text-[13px] font-medium transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/5 disabled:opacity-30"
              >
                Listen
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={60}
                max={200}
                step={1}
                placeholder="bpm"
                aria-label="Tempo in beats per minute"
                data-testid="tempo-bpm"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const v = parseFloat((e.target as HTMLInputElement).value);
                  if (Number.isFinite(v)) onTempoBpm?.(v);
                }}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) onTempoBpm?.(v);
                }}
                className="h-9 w-24 rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-[12px] outline-none focus:border-accent-border"
              />
              <span className="text-[12px] opacity-30">off the setlist</span>
            </div>
            {/*
              Ableton Link (PLAN.md 13.5-link): only where a show server is
              there to join it (the Mac app, or `npm run show`), since a page
              cannot. Off until switched on, and remembered once it is.
            */}
            {tempo?.link?.available && onLink && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onLink(!tempo.link?.on)}
                  aria-pressed={tempo.link.on}
                  data-testid="tempo-link"
                  title="Follow the tempo and the bar of Live, Bitwig, Traktor or any app on this network that speaks Ableton Link"
                  className={`min-h-9 flex-none rounded-lg border px-3 text-[13px] font-medium transition-all ${tempo.link.on ? LIT : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                >
                  Link
                </button>
                <span className="text-[12px] opacity-50" data-testid="tempo-link-says">{linkLine(tempo.link)}</span>
              </div>
            )}
            {/* OSC out (PLAN.md 13.5-osc): offered, like Link, only where a show server is there to send it. */}
            {oscOut && onOscOut && <OscOutRow oscOut={oscOut} onOscOut={onOscOut} />}
            <Info>
              The beat clock works the tempo out from what it hears, which is the right answer on a clean feed from the desk and a hard one in a loud room. Three ways to tell it instead.
              {' '}<span className="text-white/70">MIDI clock</span> needs nothing set up: if the desk is sending it down the cable the faders are already on, the show locks to it{midiClocked ? ' \u2014 and it is arriving now' : ''}.
              {' '}<span className="text-white/70">Tap</span> sets the tempo *and* the bar, so tap on the downbeats and the plate is pressed on the downbeats; one tap on its own re-phases a tempo that is already running, which is how to get back on the bar after a fill.
              {' '}A <span className="text-white/70">typed number</span> sets the tempo and leaves the bar alone.
              {tempo?.link?.available && <>{' '}<span className="text-white/70">Link</span> follows the tempo and the bar of Live, Bitwig, Traktor or an iPad's AUM on the same network, with no cable, and wins over the others while a session is playing; Listen switches it off.</>}
              {oscOut && <>{' '}<span className="text-white/70">OSC out</span> goes the other way: it sends the plate's colour, the sound's levels and each beat the plate presses on to a VJ app, so its effects follow the plate (every address: docs/osc.md).</>}
              {' '}Any of them overrides the microphone until <span className="text-white/70">Listen</span>; a MIDI clock that stops sending hands back by itself.
            </Info>
            {/*
              Timecode is not a tempo, so it is its own line rather than a
              fourth way of setting one. Shown only while a desk is sending:
              a readout that says nothing all evening is worse than no readout.
            */}
            {timecode && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2" data-testid="timecode-readout">
                <span className="text-[13px] font-medium text-text">Timecode</span>
                <span className="font-mono text-[13px] tabular-nums">{timecode}</span>
                <span className="text-[12px] opacity-40">the sequence is following the desk</span>
              </div>
            )}
          </div>
        )}

        {/* Song detection: the master switch for everything that follows a song. */}
        {onSongDetection && (
          <div className="mb-4 mt-2 flex items-center justify-between gap-3" data-testid="song-detection">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-text">Song Detection</div>
              <div className="text-[12px] text-muted">Listen for which song is playing, so set items, song shows and looks made for a song go up on their own.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!songDetection}
              onClick={() => onSongDetection(!songDetection)}
              className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md p-1"
              title={songDetection ? 'On: songs are identified' : 'Off: nothing is identified'}
              data-testid="song-detection-toggle"
            >
              <SwitchPill on={!!songDetection} />
            </button>
          </div>
        )}

        {/* A new song, a new look */}
        <div className="flex flex-col gap-2 mb-4 mt-2">
          <div className="text-[13px] font-medium text-text">On a New Song</div>
          <div className="grid grid-cols-3 gap-1">
            {([['off', 'Keep'], ['preset', 'New preset'], ['random', 'Random']] as const).map(([mode, label]) => (
              <button
                aria-pressed={(settings.onNewSong ?? 'off') === mode}
                key={mode}
                onClick={() => onUpdate({ onNewSong: mode })}
                className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                  (settings.onNewSong ?? 'off') === mode ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                title={mode === 'off' ? 'Keep the look across songs' : mode === 'preset' ? 'Switch to another preset when a new song starts' : 'Roll a random look when a new song starts'}
                data-testid={`new-song-${mode}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Info>
            A new song is heard as the last one falling away into the next, even a half-second gap, or named by song recognition when one song crossfades into another. The new look comes in on a beat: quickly after a gap, slowly under a crossfade. The sequencer keeps control while it is running.
          </Info>
        </div>
        {settings.autoCalibrate !== false && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
            {calibration ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] opacity-60">
                    {calibration.calibrating ? 'Listening to the room' : calibration.signal ? 'Calibrated' : 'Room is quiet'}
                  </span>
                  <span className="text-[12px] font-mono opacity-50">
                    {calibration.floorDb.toFixed(0)} → {calibration.peakDb.toFixed(0)} dB
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${calibration.calibrating ? 'bg-white/60' : 'bg-emerald-400/80'}`}
                    style={{ width: `${Math.round(calibration.progress * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <span className="text-[12px] opacity-40">Waiting for audio</span>
            )}
            <button
              onClick={() => onRecalibrate?.()}
              className="mt-3 w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-[13px] font-medium opacity-70 transition-colors hover:bg-white/10 hover:opacity-100"
            >
              Recalibrate room
            </button>
          </div>
        )}
        {/* What each band of the sound moves: Sound Mappings, as was. */}
        <span className="mb-2 mt-4 block text-[11px] font-medium uppercase tracking-wide text-white/40">What the sound moves</span>
        {/*
          The selects below are the fixed wiring — which audio band drives
          velocity, density and colour — and they stay, because they are what
          the solver reads directly. The other way in is a patch, which can
          take *any* audio feature to *any* setting; Sound Impact, the master
          over those, sits with the patch bay under Patches.

          Rotation was a fourth select here, the same `audioMappings.rotation`
          as Plate Spin's "Driven by": two drawings of one route, the one here
          with no word of what it turned (PLAN 35c-5). It lives with the motor
          it adds to, and this list says where.
        */}
        {['velocity', 'density', 'color'].map((param) => (
          <div key={param} className="flex flex-col gap-2 mb-4">
            <span className="text-[13px] font-medium text-text">{param}</span>
            <select
              value={settings.audioMappings[param as keyof typeof settings.audioMappings]}
              onChange={(e) => onUpdate({
                audioMappings: {
                  ...settings.audioMappings,
                  [param]: e.target.value
                }
              })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:border-white/30 transition-all"
            >
              {['none', 'volume', 'bass', 'mid', 'treble', 'energy', 'timbre', 'complexity'].map((feature) => (
                <option key={feature} value={feature} className="bg-gray-900">
                  {feature}
                </option>
              ))}
            </select>
          </div>
        ))}
        <p className="mb-3 text-[12px] leading-relaxed text-white/40">
          Turning the plates with the music is in {goTo('spin', 'sound')}. Any sound feature onto any other control is a patch, in {goTo('patches', 'sound')}.
        </p>
      </section>
      )}
    </>
  );
};
