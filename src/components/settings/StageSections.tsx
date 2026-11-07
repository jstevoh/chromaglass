import { Zap, Layers, Projector, Image, Shapes } from 'lucide-react';
import { BlendMode, LedMode, SimResolution } from '../../types';
import { groupOf } from '../../lib/settingsMap';
import { Info } from '../Info';
import { MappingPanel, OutputPanel } from '../OutputPanel';
import { SwitchPill, Toggle, LIT } from '../ui';
import { isProLicenseUnlocked } from '../../lib/platform';
import { CHECKOUT_PRO_URL, CHECKOUT_UPGRADE_URL, getEffectiveTier, isFreeTierGated, isTierGatingEnforced, openAccountSheet } from '../../lib/tierGates';
import { Slider, PinChips } from './controls';
import type { SectionCtx } from './props';

/*
  Stage: the room and the machine. The wall, the mapping, the logo and titles, the
  simulation and the plates and the LED. The Stage sheet draws only these.

  Each section is the markup that sat inline in `SettingsPanel`'s `sections` tree,
  moved verbatim (PLAN 19ai-9): its `{keep(id) && (<section ...>)}` is unchanged, so
  a desk panel, the Stage sheet and the full sheet draw it exactly as before, and
  it takes the panel's props and locals as one object (`SectionCtx`, in
  `props.ts`), destructuring only the names its markup reads. `npm run panel`
  reads this file with the panel (`scripts/settingsSource.mjs`).
*/
export const ProjectorsSection = ({ c }: { c: SectionCtx }) => {
  const {
    projectorMode, onProjectorMode, projectorName, output, onOutput, onOutputReset, wakeLock,
    wallTest, onWallTest, focusSection, keep, shown, CARD, GRID, TITLE,
  } = c;
  return (
    <>

      {/*
        Wall

        The id is still `projectors`, which is what the Wall dot and every
        deep link open. The section is only the wall now: where the picture
        goes and what shape it arrives in, set once at load-in. The look
        effects that shared it are under Lamp & Light, and the film projector
        is an input of its own.
      */}
      {keep('projectors') && (
      <section id="settings-projectors" className={`${CARD} ${shown('projectors') ? GRID : 'hidden'} ${focusSection === 'projectors' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('projectors')} data-section="projectors">
        <h3 className={TITLE}>
          <Projector size={12} /> Wall
        </h3>
        {onProjectorMode && (
          <div className="flex flex-col gap-2 mb-5">
            <div className="text-[13px] font-medium text-text">Second Screen</div>
            <div className="grid grid-cols-3 gap-1">
              {([['ask', 'Ask'], ['auto', 'Automatic'], ['off', 'Off']] as const).map(([m, label]) => (
                <button
                  aria-pressed={projectorMode === m}
                  key={m}
                  onClick={() => onProjectorMode(m)}
                  className={`py-1.5 rounded-lg text-[13px] font-medium border transition-all ${projectorMode === m ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                  data-testid={`projector-mode-${m}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Info>
              A projector on HDMI is a second screen. <span className="text-white/70">Ask</span> offers to send the show there; <span className="text-white/70">Automatic</span> sends it the moment the projector is connected, on your next click or key press (the browser needs one), fullscreen with nothing but the plate on it, and the laptop keeps the controls.{projectorName ? ` Connected now: ${projectorName}.` : ' Chrome asks once for permission to see your screens.'}
            </Info>
          </div>
        )}
        {output && onOutput && onOutputReset && (
          <OutputPanel output={output} onChange={onOutput} onReset={onOutputReset} wakeLock={wakeLock} test={wallTest} onTest={onWallTest} />
        )}
      </section>
      )}
    </>
  );
};

export const MappingSection = ({ c }: { c: SectionCtx }) => {
  const { output, onOutput, focusSection, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Mapping Section */}
      {keep('mapping') && (
      <section id="settings-mapping" className={`${CARD} ${shown('mapping') ? GRID : 'hidden'} ${focusSection === 'mapping' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('mapping')} data-section="mapping">
        <h3 className={TITLE}>
          <Shapes size={12} /> Mapping
        </h3>
        {output && onOutput && <MappingPanel output={output} onChange={onOutput} />}
      </section>
      )}
    </>
  );
};

export const MarkSection = ({ c }: { c: SectionCtx }) => {
  const {
    settings, onUpdate, markLoaded, onMarkFile, onMarkClear, focusSection, markInputRef, keep,
    shown, CARD, GRID, TITLE,
  } = c;
  return (
    <>

      {/* Simulation Section */}
      {/*
        Logo & Titles

        The one thing on the wall that is not the plate. `injectImage` already
        existed and pours a picture into the liquid as dye, which is the lovely
        thing to do with an image and the wrong thing to do with the mark of
        whoever is paying for the room: it dissolves in about four seconds.
        This one sits over the top and stays put for three hours.
      */}
      {keep('mark') && (
      <section id="settings-mark" className={`${CARD} ${shown('mark') ? GRID : 'hidden'} ${focusSection === 'mark' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('mark')} data-section="mark">
        <h3 className={TITLE}>
          <Image size={12} /> Logo &amp; Titles
        </h3>
        {isFreeTierGated() ? (
          <div className="mb-5 flex flex-col gap-2.5">
            <div
              data-cg-free-logo-mark="ChromaGlass"
              data-cg-app-tile="custom-logo"
              onClick={openAccountSheet}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAccountSheet(); } }}
              className="cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-100 transition-colors hover:border-amber-400/50 hover:bg-amber-500/15"
            >
              <div className="flex items-center justify-between gap-2 font-semibold text-amber-200">
                <span>In the ChromaGlass app · Custom band logo &amp; text layer</span>
                <span className="shrink-0 text-[11px] font-medium text-amber-300 underline underline-offset-2">Get Home or Pro →</span>
              </div>
              <p className="mt-0.5 text-amber-100/90">
                On the free site, the logo layer displays the ChromaGlass mark. Unlock Home or Pro to load your own band mark or SVG.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="80" viewBox="0 0 420 80"><text x="210" y="52" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="38" font-weight="600" letter-spacing="2">ChromaGlass</text></svg>`;
                  onMarkFile?.(new File([svg], 'chromaglass-mark.svg', { type: 'image/svg+xml' }));
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-[13px] font-medium hover:bg-white/10"
                data-testid="mark-load"
              >
                <Image size={13} /> {markLoaded ? 'ChromaGlass mark active' : 'Show ChromaGlass mark'}
              </button>
              <button
                onClick={() => onMarkClear?.()}
                disabled={!markLoaded}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[13px] font-medium hover:bg-white/10 disabled:opacity-30"
                data-testid="mark-clear"
              >
                Take it off
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mb-5">
            <input
              ref={markInputRef}
              id="mark-file"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onMarkFile?.(f); e.target.value = ''; }}
            />
            <button
              onClick={() => markInputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-[13px] font-medium hover:bg-white/10"
              title="A PNG with transparency sits on the plate; anything else sits in its own rectangle"
              data-testid="mark-load"
            >
              <Image size={13} /> {markLoaded ? 'Replace' : 'Load a mark'}
            </button>
            <button
              onClick={() => onMarkClear?.()}
              disabled={!markLoaded}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[13px] font-medium hover:bg-white/10 disabled:opacity-30"
              data-testid="mark-clear"
            >
              Take it off
            </button>
          </div>
        )}
        <Slider label="Opacity" value={settings.markMix ?? 1} min={0} max={1} step={0.01}
          onChange={(v: number) => onUpdate({ markMix: v })} settingKey="markMix" />
        <Slider label="Size" value={settings.markScale ?? 0.22} min={0.03} max={1} step={0.01}
          onChange={(v: number) => onUpdate({ markScale: v })} settingKey="markScale" />
        <Slider label="Across" value={settings.markX ?? 0.5} min={0} max={1} step={0.005}
          onChange={(v: number) => onUpdate({ markX: v })} settingKey="markX" />
        <Slider label="Up" value={settings.markY ?? 0.12} min={0} max={1} step={0.005}
          onChange={(v: number) => onUpdate({ markY: v })} settingKey="markY" />
        <Info>
          Laid over the finished frame, so it reaches the projector window, a cast to another screen, a recording and
          another machine capturing this one — not just the laptop's own screen. A PNG with transparency is what you
          want; the plate shows through wherever the file is transparent. It sits under nothing, including the house
          dimmer, so a blackout leaves the mark on the wall. Its own opacity is the control for taking it off.
        </Info>
      </section>
      )}
    </>
  );
};

export const SimulationSection = ({ c }: { c: SectionCtx }) => {
  const {
    settings, onUpdate, engineStatus, focusSection, live, showFrameSplit, keep, shown, CARD, GRID,
    TITLE,
  } = c;
  return (
    <>

      {keep('simulation') && (
      <section id="settings-simulation" className={`${CARD} ${shown('simulation') ? GRID : 'hidden'} ${focusSection === 'simulation' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('simulation')} data-section="simulation">
        <h3 className={TITLE}>
          <Zap size={12} /> Simulation
        </h3>
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-text">Fluid Grid</span>
            {engineStatus && (
              <span className="text-[12px] font-mono opacity-50">
                {engineStatus.label} · {(live ?? engineStatus).frameMs > 0 ? Math.round(1000 / (live ?? engineStatus).frameMs) : '–'} fps
                {/*
                  The speed, when it is not full speed. A frame rate says the
                  frames are arriving; it cannot say the liquid inside them is
                  advancing slower than the clock, which is what happens when a
                  solver step costs more than a frame and the catch-up gives up.
                  Shown only when it is true, because on a machine with room it
                  is always 60 and would be noise.
                */}
                {(() => {
                  const st = live ?? engineStatus;
                  const sps = st.stepsPerSec;
                  // Against what the loop asked for, not a hard sixty. Thirty
                  // steps at twice the timestep is the same liquid at the same
                  // speed, and this read it as "50% speed" in amber — the one
                  // warning that catches a plate silently running slow, fired
                  // at a plate running exactly on time.
                  const want = st.stepRate > 0 ? st.stepRate : 60;
                  if (!(sps > 0) || sps >= want * 0.95) return null;
                  return <span className="text-amber-300/80"> · {Math.round((sps / want) * 100)}% speed</span>;
                })()}
              </span>
            )}
          </div>
          {/*
            Where a frame actually goes, on a `?debug` visit. Cost that does
            not fall when the grid falls is not the grid's cost, and that is
            the whole question a grid sweep is trying to answer — so put both
            halves next to the control that changes the grid, rather than
            behind a console command typed once per reading.

            `solver` is the CPU time to submit one step across every layer,
            not the GPU time to run it, which the governor now reads from
            timestamp queries instead.
          */}
          {showFrameSplit && engineStatus && (
            <div className="text-[11px] font-mono opacity-40 leading-relaxed">
              solver {(live ?? engineStatus).simMs.toFixed(1)} ms/step
              {' · '}other {(live ?? engineStatus).otherMs.toFixed(1)} ms/frame
              {' · '}{Math.round((live ?? engineStatus).stepsPerSec)} of {Math.round((live ?? engineStatus).stepRate || 60)} steps/s
            </div>
          )}
          <select
            value={String(settings.simResolution ?? 'auto')}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '1024' && isTierGatingEnforced() && !isProLicenseUnlocked()) return;
              onUpdate({ simResolution: (v === 'auto' ? v : Number(v)) as SimResolution });
            }}
            className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm focus:outline-none focus:border-white/50"
            title="Grid the fluid is solved on. Finer grids resolve thinner filaments and real cell structure; Auto leaves the choice to the governor, which measures the GPU's own frame cost."
          >
            <option value="auto">Auto</option>
            <option value="256">GPU · 256² (light)</option>
            <option value="384">GPU · 384²</option>
            <option value="512">GPU · 512²</option>
            <option value="768">GPU · 768² (heavy)</option>
            <option value="1024" disabled={isTierGatingEnforced() && !isProLicenseUnlocked()}>GPU · 1024² (Pro · ultra)</option>
          </select>
          <Info>
            Finer grids let the physics form the filaments and cells itself instead of the closeup synthesising them.
            Auto measures the frame rate and picks the largest grid this machine holds at 60 fps
            {engineStatus?.governed && engineStatus.steppedDown ? ' — it has stepped down on this machine.' : '.'}
            {engineStatus && ` Running ${engineStatus.tier === 'hosted' ? 'from the web' : engineStatus.tier === 'native' ? 'natively' : 'locally'}; ${engineStatus.gpu === 'software' ? 'software GL' : `${engineStatus.gpu} GPU`}.`}
          </Info>
          {((engineStatus?.governed && engineStatus.steppedDown) || engineStatus?.gpuUnavailable) && !isProLicenseUnlocked() && (
            <div
              data-cg-grid-upgrade-pro=""
              className="mt-1 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-3 text-[12px] leading-snug text-amber-100/90"
            >
              <div className="font-semibold text-amber-200">
                Upgrade to ChromaGlass Pro for full GPU &amp; CPU headroom
              </div>
              <p className="mt-1 text-[11px] text-white/75">
                Pro lets the automatic quality ladder climb to <span className="font-mono text-white/90">768²</span> at <span className="font-mono text-white/90">2x</span> and <span className="font-mono text-white/90">1024²</span> at <span className="font-mono text-white/90">1x</span>, and unlocks the <span className="font-mono text-white/90">1024²</span> grid pin on your machine.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={getEffectiveTier() === 'home' ? CHECKOUT_UPGRADE_URL : CHECKOUT_PRO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-black hover:bg-amber-300"
                >
                  {getEffectiveTier() === 'home' ? 'Upgrade to Pro — $164' : 'Get Pro — $199'}
                </a>
                <button
                  type="button"
                  onClick={openAccountSheet}
                  className="rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/85 hover:bg-white/[0.12]"
                >
                  Enter licence key
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      )}
    </>
  );
};

export const LayersSection = ({ c }: { c: SectionCtx }) => {
  const { settings, onUpdate, backLook, focusSection, blendModes, keep, shown, CARD, GRID, TITLE } = c;
  return (
    <>

      {/* Mixer Section */}
      {keep('layers') && (
      <section id="settings-layers" className={`${CARD} ${shown('layers') ? GRID : 'hidden'} ${focusSection === 'layers' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('layers')} data-section="layers">
        <h3 className={TITLE}>
          <Layers size={12} /> Plates &amp; LED
        </h3>
        <Slider
          label="Layers"
          value={settings.layerCount}
          min={1}
          max={2}
          step={1}
          onChange={(v: number) => onUpdate({ layerCount: Math.round(v) })}
          settingKey="layerCount"
        />
        {/* The look's own count, which a back plate with a look of its own
            (PLAN.md §16a) keeps at two on the stage whatever it says, so the
            slider at 1 with two plates showing is explained, not a fault. */}
        {backLook && (settings.layerCount ?? 1) < 2 && (
          <p className="col-span-full text-[12px] text-dim" data-testid="settings-back-plate-on">
            The back plate is on {backLook}, so it stays on the stage until it follows the front again.
          </p>
        )}
        <div className="mb-4 mt-4">
          <Toggle
            label="LED Platform"
            on={!!settings.ledPlatform}
            onChange={v => onUpdate({ ledPlatform: v })}
            testId="led-platform-toggle"
          />
        </div>
        {settings.ledPlatform && (
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-text">LED Mode</span>
              <select
                value={settings.ledMode}
                onChange={(e) => onUpdate({ ledMode: e.target.value as LedMode })}
                className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm focus:outline-none focus:border-white/50"
              >
                <option value="single">Single Color</option>
                <option value="rainbow">Rainbow Wheel</option>
                <option value="ocean">Ocean Depths</option>
                <option value="fire">Fire Pit</option>
                <option value="cyberpunk">Cyberpunk</option>
              </select>
            </div>
            
            {settings.ledMode === 'single' && (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-medium text-text">LED Color</span>
                <input
                  type="color"
                  value={settings.ledColor}
                  onChange={(e) => onUpdate({ ledColor: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer bg-transparent border-none p-0"
                />
              </div>
            )}
            
            <Slider
              label="LED Rotation Speed"
              value={settings.ledSpeed}
              min={0}
              max={2.0}
              step={0.05}
              onChange={(v: number) => onUpdate({ ledSpeed: v })}
          settingKey="ledSpeed"
        />
          </div>
        )}
        <Slider
          label="Center Gravity (Concave)"
          value={settings.centerGravity}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ centerGravity: v })}
          settingKey="centerGravity"
        />
        <Slider
          label="Comet Flow"
          value={settings.cometSpeed}
          min={0}
          max={2.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ cometSpeed: v })}
          settingKey="cometSpeed"
        />
        {(settings.cometSpeed ?? 0) > 0 && (
          <div className="pl-4 border-l-2 border-white/10 ml-2">
            <Slider
              label="Flow Direction"
              value={settings.cometAngle}
              min={0}
              max={360}
              step={5}
              onChange={(v: number) => onUpdate({ cometAngle: v })}
              settingKey="cometAngle"
            />
          </div>
        )}
        <Slider
          label="Gooey Blending"
          value={settings.gooeyEffect}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ gooeyEffect: v })}
          settingKey="gooeyEffect"
        />
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-text">Blend Mode</span>
          <select
            value={settings.blendMode}
            onChange={(e) => onUpdate({ blendMode: e.target.value as BlendMode })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:border-white/30 transition-all"
          >
            {blendModes.map((mode) => (
              <option key={mode} value={mode} className="bg-gray-900">
                {mode}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between mt-4">
          <span className="text-[13px] font-medium text-text">Two Projectors</span>
          <div className="flex items-center gap-2">
            <PinChips settingKey="twoProjectors" />
            <button
              type="button"
              role="switch"
              aria-checked={settings.twoProjectors > 0.5}
              aria-label="Two Projectors"
              onClick={() => onUpdate({ twoProjectors: settings.twoProjectors > 0.5 ? 0 : 1 })}
              className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md p-1"
              data-testid="two-projectors-toggle"
            >
              <SwitchPill on={settings.twoProjectors > 0.5} />
            </button>
          </div>
        </div>
      </section>
      )}
    </>
  );
};
