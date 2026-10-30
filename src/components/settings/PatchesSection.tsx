import React from 'react';
import { X, Cable } from 'lucide-react';
import { SceneMapping, PatchSource } from '../../types';
import { PER_LAYER } from '../../lib/sceneMap';
import { AREA_TARGETS, isAreaTarget } from '../../lib/areaCords';
import { isClassFeature } from '../../lib/hitSource';
import { AreaPicker } from '../phone/AreaPicker';
import { BandStrip } from '../phone/BandStrip';
import { groupOf } from '../../lib/settingsMap';
import { Info } from '../Info';
import { LIT } from '../ui';
import { Slider } from './controls';
import { PATCH_SOURCES, featuresFor, sceneTargets, TARGET_GROUPS } from './patchLists';
import type { SectionCtx } from './props';

/*
  Feed: the patch bay, where a reading of the room, the film, the sound or a shape is
  plugged into a control (its lists are in `patchLists.ts`).

  Each section is the markup that sat inline in `SettingsPanel`'s `sections` tree,
  moved verbatim (PLAN 19ai-9): its `{keep(id) && (<section ...>)}` is unchanged, so
  a desk panel, the Stage sheet and the full sheet draw it exactly as before, and
  it takes the panel's props and locals as one object (`SectionCtx`, in
  `props.ts`), destructuring only the names its markup reads. `npm run panel`
  reads this file with the panel (`scripts/settingsSource.mjs`).
*/
export const PatchesSection = ({ c }: { c: SectionCtx }) => {
  const {
    settings, onUpdate, readEar, focusSection, lookAreas, areaColours, keep, shown, goTo, listens,
    CARD, GRID, TITLE,
  } = c;
  return (
    <>

      {/*
        Patches

        The patch bay, and the four faders that each pull a whole source down.

        It lived in The Room, because the room camera was the first thing that
        could ride a setting. By the time it also read the film, the sound and
        the shapes, most of what it routed had nothing to do with the room,
        and its masters were spread across three sections — Sound Impact in
        Sound Mappings, Room Impact in The Room, Film Impact in Projectors —
        while the shapes had none on screen at all. The bay and every master
        over it are one place now, after the sources it reads.
      */}
      {keep('patches') && (
      <section id="settings-patches" className={`${CARD} ${shown('patches') ? GRID : 'hidden'} ${focusSection === 'patches' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('patches')} data-section="patches">
        <h3 className={TITLE}>
          <Cable size={12} /> Patches
        </h3>
        <Info>
          A patch is a <span className="text-white/60">source</span>, something that changes in it,
          a control it moves, and how far — a floor filling up opening the turbulence, a crowd
          going still slowing the plate, someone crossing left to right walking the lamp across
          with them. The source can be the room camera, the film projector, the sound (its
          levels, its bands, or its hits: how hard each kick, snare and hat landed, and the
          note), or a shape (an LFO on the bar, or an envelope a pad fires), and a patch can
          land on every plate or on one of them, so a reel can drive layer 1 while the bass
          drives layer 2.
        </Info>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-medium text-text">Patch bay</div>
            <button
              onClick={() => onUpdate({ sceneMappings: [...(settings.sceneMappings ?? []), { source: 'room', feature: 'motion', setting: 'turbulenceScale', depth: 0.5, layer: 'all' }] })}
              className="px-2 py-1 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 text-[13px] font-medium"
              data-testid="scene-map-add"
            >
              Add
            </button>
          </div>
          {(settings.sceneMappings ?? []).length === 0 ? (
            <p className="text-[12px] text-white/40" data-testid="patch-empty">
              Nothing patched yet. Add one, then pick what it listens to and what it moves.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {(settings.sceneMappings ?? []).map((m, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="flex items-center gap-1">
                    {/*
                      Which source this patch listens to. Changing it has to
                      change the feature too: "how many people" is not
                      something the sound can tell you, and a patch left
                      pointing at a feature its source does not have would
                      quietly read zero for ever.
                    */}
                    <select
                      value={m.source ?? 'room'}
                      aria-label="Source"
                      onChange={(e) => {
                        const source = e.target.value as PatchSource;
                        const options = featuresFor(source);
                        const keep = options.some(([v]) => v === m.feature);
                        const next = [...(settings.sceneMappings ?? [])];
                        const { band: _dropBand, ...rest } = m;
                        next[i] = {
                          ...(source === 'bands' ? m : rest),
                          source,
                          feature: (keep ? m.feature : options[0][0]) as SceneMapping['feature'],
                        };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="min-h-6 w-[58px] shrink-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none"
                      data-testid={`patch-source-${i}`}
                    >
                      {PATCH_SOURCES.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <select
                      value={m.feature}
                      aria-label="Feature"
                      onChange={(e) => {
                        const next = [...(settings.sceneMappings ?? [])];
                        const { band: _dropBand, ...rest } = m;
                        next[i] = { ...rest, feature: e.target.value as SceneMapping['feature'] };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="min-h-6 flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none"
                      data-testid={`patch-feature-${i}`}
                    >
                      {featuresFor(m.source ?? 'room').map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    {/*
                      What it moves. Aimed at an area, what a hand does there
                      (lib/areaCords.ts): a setting is one number for the
                      whole plate, so an area takes the four acts and nothing
                      else, and the whole plate takes settings.
                    */}
                    <select
                      value={m.setting}
                      aria-label="Control"
                      onChange={(e) => {
                        const next = [...(settings.sceneMappings ?? [])];
                        next[i] = { ...m, setting: e.target.value as SceneMapping['setting'] };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="min-h-6 flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none"
                      data-testid={`patch-control-${i}`}
                    >
                      {m.area !== undefined ? AREA_TARGETS.map(t => (
                        <option key={t.key} value={t.key} title={t.hint}>{t.label}</option>
                      )) : TARGET_GROUPS.map(g => (
                        <optgroup key={g.id} label={g.name}>
                          {g.targets.map(t => (
                            <option key={String(t.key)} value={String(t.key)}>{t.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      onClick={() => onUpdate({ sceneMappings: (settings.sceneMappings ?? []).filter((_, j) => j !== i) })}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-white/10 opacity-50 hover:opacity-100"
                      aria-label="Remove mapping"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {/*
                      Which plate it lands on.

                      Only the settings the solver reads can differ between
                      plates — how a layer moves and evolves. Bloom is done
                      once over the finished picture, so aiming it at layer 2
                      would do nothing at all, and a dropdown that offers a
                      choice doing nothing is worse than one that does not
                      offer it. `PER_LAYER` is that list and the harness checks
                      it against the solver's own source.
                    */}
                    <select
                      value={String(m.layer ?? 'all')}
                      aria-label="Plate"
                      disabled={m.area !== undefined || !PER_LAYER.has(String(m.setting))}
                      title={m.area !== undefined ? 'An area cord works on the plate the music plays'
                        : PER_LAYER.has(String(m.setting))
                        ? 'Which plate this patch moves'
                        : `${sceneTargets.find(t => t.key === m.setting)?.label ?? 'This control'} is part of the finished picture, not one plate`}
                      onChange={(e) => {
                        const v = e.target.value;
                        const next = [...(settings.sceneMappings ?? [])];
                        next[i] = { ...m, layer: v === 'all' ? 'all' : Number(v) };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="min-h-6 w-[76px] shrink-0 bg-black/40 border border-white/10 rounded px-1 py-1 text-[12px] outline-none disabled:opacity-30"
                      data-testid={`patch-layer-${i}`}
                    >
                      <option value="all">All plates</option>
                      {Array.from({ length: Math.max(1, settings.layerCount ?? 1) }, (_, n) => (
                        <option key={n} value={String(n)}>Layer {n + 1}</option>
                      ))}
                    </select>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={m.depth}
                      aria-label="Depth"
                      onChange={(e) => {
                        const next = [...(settings.sceneMappings ?? [])];
                        next[i] = { ...m, depth: parseFloat(e.target.value) };
                        onUpdate({ sceneMappings: next });
                      }}
                      className="set-range flex-1"
                      style={{ '--fill': `${Math.round(50 * (m.depth + 1))}%` } as React.CSSProperties}
                    />
                    <span className="text-[12px] font-mono opacity-50 w-9 text-right">{m.depth.toFixed(2)}</span>
                  </div>
                  {/*
                    Live spectrum strip for `bands` cords (PLAN 30a): log
                    frequency 40 Hz–16 kHz, the eight fixed bands marked, and
                    the gate threshold drawn on the cord's own live reading.
                    Dragging a band writes `band: [loHz, hiHz]` and updates
                    `feature` to the named band holding the drag's middle.
                  */}
                  {m.source === 'bands' && (
                    <div className="mt-2">
                      <BandStrip
                        band={m.band}
                        feature={m.feature}
                        gain={m.gain ?? 1}
                        threshold={(m.area !== undefined
                          ? (m.mode === 'gate' || (m.mode !== 'follow' && (m.threshold !== undefined || m.attack !== undefined || m.release !== undefined)))
                          : m.mode === 'gate')
                          ? (m.threshold ?? 0.3)
                          : undefined}
                        readEar={readEar}
                        testId={`patch-band-${i}`}
                        onChange={(band, feature) => {
                          const next = [...(settings.sceneMappings ?? [])];
                          const { band: _oldBand, ...rest } = m;
                          next[i] = band ? { ...rest, band, feature } : { ...rest, feature };
                          onUpdate({ sceneMappings: next });
                        }}
                      />
                    </div>
                  )}
                  {/*
                    Where on the plate (PLAN 25h): on a look with areas of the
                    dish, the cord can work one of them alone. Aiming it at an
                    area turns its control into what a hand does there (Stir,
                    to start), and aiming it back at the plate gives it a
                    setting again (Turbulence), so the cord is never left
                    naming something its aim cannot take.
                  */}
                  {lookAreas && (
                    <div className="mt-2">
                      <AreaPicker
                        areas={lookAreas}
                        colours={areaColours}
                        value={m.area !== undefined && m.area < lookAreas.length ? m.area : undefined}
                        testId={`patch-area-${i}`}
                        onChange={(area) => {
                          const next = [...(settings.sceneMappings ?? [])];
                          const { area: _drop, layer: _layer, ...rest } = m;
                          next[i] = area === undefined
                            ? { ...rest, layer: m.layer ?? 'all', setting: isAreaTarget(m.setting) ? 'turbulenceScale' : m.setting }
                            : { ...rest, area, setting: isAreaTarget(m.setting) ? m.setting : 'areaStir' };
                          onUpdate({ sceneMappings: next });
                        }}
                      />
                    </div>
                  )}
                  {/*
                    Shaping the cord (PLAN 30a / 25h-2): gain before the
                    threshold on sound and band cords, and mode (Follow vs Gate)
                    with Gate (threshold), Rise (attack) and Fall (release) on
                    both whole-plate sound/band cords and area cords. Not on the
                    note (PLAN 25i): a name has no level to gate or gain.
                  */}
                  {(m.source === 'sound' || m.source === 'bands' || m.area !== undefined) && !isClassFeature(m.feature) && (() => {
                    const isSoundOrBands = m.source === 'sound' || m.source === 'bands';
                    const isGated = m.area !== undefined
                      ? (m.mode === 'gate' || (m.mode !== 'follow' && (m.threshold !== undefined || m.attack !== undefined || m.release !== undefined)))
                      : m.mode === 'gate';
                    return (
                      <div className="mt-2 flex flex-col gap-1.5" data-testid={`patch-gate-${i}`}>
                        {isSoundOrBands && (
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] text-white/60 w-9">Gain</span>
                            <input
                              type="range" min={0} max={4} step={0.05}
                              value={m.gain ?? 1}
                              aria-label="Gain"
                              onChange={(e) => {
                                const next = [...(settings.sceneMappings ?? [])];
                                next[i] = { ...m, gain: parseFloat(e.target.value) };
                                onUpdate({ sceneMappings: next });
                              }}
                              className="set-range flex-1"
                              style={{ '--fill': `${Math.round(100 * (m.gain ?? 1) / 4)}%` } as React.CSSProperties}
                              data-testid={`patch-gain-${i}`}
                            />
                            <span className="text-[12px] font-mono opacity-50 w-12 text-right">{`${(m.gain ?? 1).toFixed(2)}×`}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 min-h-[28px]" data-testid={`patch-mode-${i}`}>
                          <span className="text-[12px] text-white/60">Mode</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-pressed={!isGated}
                              onClick={() => {
                                const next = [...(settings.sceneMappings ?? [])];
                                const { mode: _m, threshold: _t, attack: _a, release: _r, ...rest } = m;
                                next[i] = rest;
                                onUpdate({ sceneMappings: next });
                              }}
                              className={`min-h-6 px-2.5 rounded text-[12px] font-medium border ${!isGated ? LIT : 'bg-transparent border-white/10'}`}
                              data-testid={`patch-mode-follow-${i}`}
                            >
                              Follow
                            </button>
                            <button
                              type="button"
                              aria-pressed={isGated}
                              onClick={() => {
                                const next = [...(settings.sceneMappings ?? [])];
                                next[i] = {
                                  ...m,
                                  mode: 'gate',
                                  threshold: m.threshold ?? 0.3,
                                  attack: m.attack ?? 0.02,
                                  release: m.release ?? 0.4,
                                };
                                onUpdate({ sceneMappings: next });
                              }}
                              className={`min-h-6 px-2.5 rounded text-[12px] font-medium border ${isGated ? LIT : 'bg-transparent border-white/10'}`}
                              data-testid={`patch-gate-on-${i}`}
                            >
                              Gate
                            </button>
                          </div>
                        </div>
                        {isGated && ([
                          ['threshold', 'Gate', 0, 1, 0.05, (v: number) => v.toFixed(2)],
                          ['attack', 'Rise', 0, 2, 0.01, (v: number) => `${v.toFixed(2)} s`],
                          ['release', 'Fall', 0, 4, 0.05, (v: number) => `${v.toFixed(2)} s`],
                        ] as const).map(([key, label, min, max, step, show]) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-[12px] text-white/60 w-9">{label}</span>
                            <input
                              type="range" min={min} max={max} step={step}
                              value={m[key] ?? 0}
                              aria-label={label}
                              onChange={(e) => {
                                const next = [...(settings.sceneMappings ?? [])];
                                next[i] = { ...m, [key]: parseFloat(e.target.value) };
                                onUpdate({ sceneMappings: next });
                              }}
                              className="set-range flex-1"
                              style={{ '--fill': `${Math.round(100 * ((m[key] ?? 0) - min) / Math.max(1e-9, max - min))}%` } as React.CSSProperties}
                              data-testid={`patch-${key}-${i}`}
                            />
                            <span className="text-[12px] font-mono opacity-50 w-12 text-right">{show(m[key] ?? 0)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
        {/*
          The masters, one per source. Three of them sit beside the Drive of
          the source they scale (Room Impact under Room Drive, Film Impact
          under Film Drive, Sound Impact under Sound Drive): the owner found
          two strengths for one input in two sections (PLAN 35c-2). Shapes
          have no input section, a wave or an envelope being the bay's own, so
          their master stays here.

          Each is greyed until a patch actually reads its source, rather than
          until any patch exists. With one room patch in the bay the old rule
          lit all three, and a fader that moves nothing is exactly what this
          panel keeps being fixed for.
        */}
        <div className="mt-6 mb-3 text-[13px] font-medium text-text">Masters</div>
        <Slider
          label="Shapes Impact"
          disabled={!listens('shape') && 'no patch reads a shape'}
          value={settings.shapeImpact ?? 1}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ shapeImpact: v })}
          settingKey="shapeImpact"
        />
        <Info>
          Each source has one master over every patch that reads it, so a whole source can be pulled down on one fader without touching the patches themselves: the room out of a quiet song, the film under the band, the sound off while the reel carries it. <span className="text-white/70">Room Impact</span> is in {goTo('room', 'patches')}, <span className="text-white/70">Film Impact</span> in {goTo('film', 'patches')} and <span className="text-white/70">Sound Impact</span> in {goTo('audio-input', 'patches')}, each under the Drive of the same source; Shapes Impact is the one here. Film Impact starts at zero, so a look saved before the film could ride anything does exactly what it did.
        </Info>
      </section>
      )}
    </>
  );
};
