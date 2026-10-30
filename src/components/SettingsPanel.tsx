import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BlendMode, PatchSource } from '../types';
import { factoryFor } from '../lib/midi';
import { plateAreas, areaFamily, areaDye } from '../lib/plateAreas';
import { PRESET_CONTRACTS } from '../presetPlate';
import { PALETTE } from '../constants';
import { SETTINGS_CATEGORIES, SETTINGS_SECTIONS, SECTION_BY_ID, FIRST_SECTION, sectionMatches } from '../lib/settingsMap';
import { Sheet } from './ui';
import type { EngineStatus } from '../lib/platform';
import { APP_FEATURE_TILES, getEffectiveTier, isTierGatingEnforced, openAccountSheet } from '../lib/tierGates';
import { MasterSection, MixerSection } from './settings/PlaySections';
import { AudioInputSection } from './settings/SoundSection';
import { LookSection, ShowSection, CameraSection, StockSection, LampSection, MacroSection } from './settings/LookSections';
import { KaleidoscopeSection, TiltSection, SpinSection, PhysicsSection, AutomationSection } from './settings/MotionSections';
import { RoomSection, FilmSection } from './settings/RoomFilmSections';
import { PatchesSection } from './settings/PatchesSection';
import { MidiSection } from './settings/MidiSection';
import { SquishSection, OilSection, FerroSection, ReactionsSection } from './settings/ChemistrySections';
import { InteractionSection, LiquidsSection } from './settings/PourSections';
import { ProjectorsSection, MappingSection, MarkSection, SimulationSection, LayersSection } from './settings/StageSections';
import { PinContext } from './settings/controls';
import type { SectionCtx, SettingsPanelProps } from './settings/props';

/*
  A section is a card, and its heading a title.

  Every section was bare on the pane with its heading an 12px uppercase
  eyebrow at 30% opacity, and a section opened from elsewhere got a ring
  drawn tight round its content, which put the controls flush against a line
  (reported, with a screenshot: "the left margin doesn't have enough
  space"). The card carries its own padding, so nothing touches an edge, and
  "opened from elsewhere" is its border turning the accent.
*/
/*
  And two sliders to a row where the pane is wide enough: most sections are
  a long run of them, and one to a row made the Look a four-screen column.
  Everything else in a section (its title, a choice, a note, a group) keeps
  the full width, so a row only ever pairs two sliders that were side by
  side in the list anyway.
*/
const SECTION_CARD = 'mb-5 scroll-mt-4 rounded-2xl border bg-white/[0.02] px-6 pb-4 pt-5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]';
/** The layout of a section that is showing: two sliders to a row where there is room. Not on a hidden one, or its grid would win over `hidden`. */
const SECTION_GRID = 'md:grid md:grid-cols-2 md:gap-x-7 [&>*]:md:col-span-2 [&>[data-slider]]:md:col-span-1';
const SECTION_TITLE = 'mb-5 flex items-center gap-2.5 text-[16px] font-semibold tracking-tight text-text [&>svg]:h-7 [&>svg]:w-7 [&>svg]:shrink-0 [&>svg]:rounded-lg [&>svg]:bg-accent-bg [&>svg]:p-1.5 [&>svg]:text-accent-text';

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onUpdate, songDetection, onSongDetection, calibration, onRecalibrate, engineStatus, getLiveEngineStatus, sceneOn = false, onSceneToggle, sceneState = null, cameras = [], sceneDeviceId = '', onSceneDevice, scenePreviewRef, filmSource = 'none', filmName = null, pourName = null, onFilmFile, onPourVideo, onStopPourVideo, onFilmCamera, filmCameraId = '', onFilmCameraDevice, filmCamera = null, filmCameraLost = false, onFilmWindow, onFilmClear, markLoaded = false, mixTakes, backLook, lookId = null, onMarkFile, onMarkClear, audioSource = 'none', onAudioSource, onAudioFile, audioInputs = [], audioInputId = '', onAudioInput, blackout = false, onBlackout, projectorMode = 'ask', onProjectorMode, projectorName = null, output, onOutput, onOutputReset, wakeLock, wallTest, onWallTest, tempo, onTap, readTempo, readEar, spinBpm = 0, onTempoClear, onTempoBpm, midiClocked = false, timecode = null, focusSection = null, liquids, pins, midi, onOpenMidi, onOpenSound, onClose, onFlickPlate, embed = null, scope = 'all', onGoTo, cartoons,
}) => {
  const filmInputRef = useRef<HTMLInputElement>(null);
  /*
    The look's areas of the dish, for the patch bay's area picker (PLAN 25h),
    each drawn in its family's colours from the look's own dyes. None for a
    look built the old way, and then the picker is not drawn at all.
  */
  const lookAreas = useMemo(() => plateAreas(lookId), [lookId]);
  const areaColours = useMemo(() => (lookAreas ?? []).map(a => areaFamily(a).map((_, k) =>
    PALETTE[areaDye(a, PRESET_CONTRACTS[lookId ?? ''] ?? [0], 0, k)]?.hex ?? '#888')), [lookAreas, lookId]);
  const markInputRef = useRef<HTMLInputElement>(null);
  /** Whether this browser can capture a window at all. Every phone cannot. */
  const canCaptureWindow = typeof navigator !== 'undefined'
    && typeof (navigator.mediaDevices as { getDisplayMedia?: unknown } | undefined)?.getDisplayMedia === 'function';
  const [live, setLive] = useState<EngineStatus | null>(null);
  /** `?debug` puts the frame's cost split under the engine readout. */
  const showFrameSplit = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('debug');
  /*
    Polled only where the readout is drawn: the Simulation section, which an
    embedded panel draws only when it is that panel. Every section docked on
    the desk is its own SettingsPanel, and each polled the engine once a
    second for a reading it never showed: on the Mac runner, where the plate
    draws and every reading is a new object, the Gig desk's Patches panel
    alone committed once a second on top of the App's clock (`npm run
    renders`: 2.0 commits/s against 1.0 renders/s on the Perform desk with
    no sound). In a cloud session the reading is null each time and the set
    is dropped, which is why it passed there.
  */
  const drawsEngine = !embed || embed === 'simulation';
  useEffect(() => {
    if (!getLiveEngineStatus || !drawsEngine) return;
    const tick = () => { setLive(getLiveEngineStatus() ?? null); };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [getLiveEngineStatus, drawsEngine]);
  const blendModes: BlendMode[] = ['screen', 'lighter', 'exclusion', 'multiply', 'overlay'];
  /**
   * Which section is in the pane.
   *
   * It used to be a three-way filter — Perform, Setup, All — over one column
   * that held every section at once. Both halves of that were wrong. The
   * filter hid ten of the sixteen behind a tab nobody had reason to press, and
   * "All" fixed that by making the column eight screens deep, which is not
   * something you navigate, only something you scroll past. A settings screen
   * is a list of places and one place at a time, and it has been for thirty
   * years, because that is the shape that lets you find a thing twice.
   */
  /** Whether this shell draws a section at all: one in a panel, the Stage ones in the Stage sheet, every one in the sheet. */
  const keep = (id: string): boolean => embed ? id === embed
    : scope === 'stage' ? SECTION_BY_ID.get(id)?.category === 'stage'
    : true;
  const firstSection = scope === 'stage' ? (SETTINGS_SECTIONS.find(x => x.category === 'stage')?.id ?? FIRST_SECTION) : FIRST_SECTION;
  const [section, setSection] = useState<string>(focusSection && keep(focusSection) ? focusSection : firstSection);
  useEffect(() => { if (focusSection) setSection(focusSection); }, [focusSection]);

  /** Typing here searches every section, whichever one is in the pane. */
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  /**
   * Is this section on screen right now?
   *
   * A search beats the rail: someone who typed "room" wants the room whether
   * or not they are standing in it. `terms` is what the section is *about*
   * rather than only what it is called — "camera", "people" and "video" all
   * have to find The Room, because the heading alone is the one word nobody
   * searches for.
   */
  const shown = (id: string): boolean => {
    if (embed) return id === embed;
    const sec = SECTION_BY_ID.get(id);
    if (q) return !!sec && sectionMatches(sec, q);
    return section === id;
  };
  /** So a search that finds nothing says so rather than showing an empty panel. */
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(1);
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    setVisibleCount(pane.querySelectorAll('section[data-section]:not(.hidden)').length);
  }, [q, section]);

  // A new place means the top of it, not wherever the last one was scrolled to.
  useEffect(() => { paneRef.current?.scrollTo({ top: 0 }); }, [section, q]);

  /**
   * Which rail rows to draw: everything, or — while searching — only the
   * sections that match, so the rail is a result list rather than a menu whose
   * rows mostly do nothing.
   */
  /** Which factory map the plugged-in controller wants, if we recognise it. */
  const detectedFactory = useMemo(() => {
    if (!midi?.enabled) return null;
    // Every open port, not just the chosen one: with "All devices" selected
    // `activeInputName` reads "2 devices", which matches nothing.
    for (const i of midi.inputs) {
      const hit = factoryFor(i.name);
      if (hit) return hit;
    }
    return null;
  }, [midi?.enabled, midi?.inputs]);

  /**
   * A way to another section, for a line that names one.
   *
   * The patch bay moved out of The Room, and anyone who knew where it was will
   * look there first. Naming the new place is half of that; being able to
   * press the name is the other half. `from` keeps each copy's test id its
   * own, because every section is in the page at once.
   */
  /*
    On a desk panel the section is the only one drawn, so a link to another
    goes where that one is: the sheet, opened at it (`onGoTo`). It is a
    24px target there, inline in the sentence, which is the desk's rule:
    both ways, because "Film" in a 12px sentence is 23.6px wide and the
    layout check found it ("room: Film 24×24") once the section was named
    Film rather than Video (PLAN 35a).
  */
  const goTo = (id: string, from: string) => (
    <button
      onClick={() => { if (embed && onGoTo) { onGoTo(id); return; } setSection(id); setQuery(''); }}
      className={`font-medium text-white/70 underline decoration-white/25 underline-offset-2 hover:text-white ${embed ? 'inline-flex min-h-6 min-w-6 items-center justify-center' : ''}`}
      data-testid={`goto-${id}-from-${from}`}
    >
      {SECTION_BY_ID.get(id)?.name ?? id}
    </button>
  );

  /** Whether any patch reads this source, which is when its master does anything. */
  const listens = (source: PatchSource) =>
    (settings.sceneMappings ?? []).some(m => (m.source ?? 'room') === source);

  const railGroups = useMemo(() => SETTINGS_CATEGORIES
    .map(cat => ({
      ...cat,
      rows: SETTINGS_SECTIONS.filter(sec => sec.category === cat.id && keep(sec.id) && (!q || sectionMatches(sec, q))),
    }))
    .filter(g => g.rows.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, scope]);
  /*
    A section in a panel is narrow, and the sheet's card (its border, its
    24 px padding, its two-column grid from 768 px of *window*) is drawn for a
    1000 px sheet. In a panel the section is its controls, one column.
  */
  const CARD = embed ? 'block' : SECTION_CARD;
  const GRID = embed ? '' : SECTION_GRID;
  const TITLE = embed ? 'hidden' : SECTION_TITLE;

  /*
    A sheet, not a drawer.

    This used to be a 320px column pinned to the right edge with 112px of top
    padding to clear a title bar that no longer exists — under a desk it sat
    over the rides and wasted a seventh of its own height on nothing. The
    sheet is centred, 720 wide, and fills the screen on a phone, so one shell
    serves every size the app runs at.
  */
  /*
    The sections, drawn once and placed in one of three shells: the sheet
    (every section, one at a time, with the rail and the search), the Stage
    sheet (the room and the machine only), or a desk panel (one section, no
    chrome: the panel's own header names it). A section not in the shell is
    not rendered at all, not merely hidden, so a desk panel and the sheet never
    put the same control, under the same test id, on the page twice; the desk
    shows a panel's section only while no sheet is open.
  */
  /*
    What each section is handed (PLAN 19ai-9). The sections were one JSX tree
    inside this component, 160 KB of it, reading the props and the locals
    above by name; each is now a component of its own in `./settings/`, moved
    verbatim, that takes this one object and destructures the names its markup
    reads. One object rather than props, because a section reads up to twenty-eight of
    these, and each section is still drawn on every render of the panel, as it
    was when it was inline: none of them holds state of its own.
  */
  const c: SectionCtx = {
    settings, onUpdate, songDetection, onSongDetection, calibration, onRecalibrate,
    engineStatus, sceneOn, onSceneToggle, sceneState, cameras, sceneDeviceId, onSceneDevice,
    scenePreviewRef, filmSource, filmName, pourName, onFilmFile, onPourVideo, onStopPourVideo,
    onFilmCamera, filmCameraId, onFilmCameraDevice, filmCamera, filmCameraLost, onFilmWindow,
    onFilmClear, markLoaded, mixTakes, backLook, onMarkFile, onMarkClear, audioSource,
    onAudioSource, audioInputs, audioInputId, onAudioInput, blackout, onBlackout, projectorMode,
    onProjectorMode, projectorName, output, onOutput, onOutputReset, wakeLock, wallTest,
    onWallTest, tempo, onTap, readTempo, readEar, spinBpm, onTempoClear, onTempoBpm,
    midiClocked, timecode, focusSection, liquids, pins, midi, onOpenMidi, onOpenSound,
    onFlickPlate, embed, cartoons, filmInputRef, markInputRef, lookAreas, areaColours,
    canCaptureWindow, live, showFrameSplit, blendModes, keep, shown, detectedFactory, goTo,
    listens, CARD, GRID, TITLE,
  };
  const sections = (
    <>
      <MasterSection c={c} />
      <MixerSection c={c} />
      <AudioInputSection c={c} />
      <LookSection c={c} />
      <ShowSection c={c} />
      <CameraSection c={c} />
      <StockSection c={c} />
      <KaleidoscopeSection c={c} />
      <LampSection c={c} />
      <RoomSection c={c} />
      <FilmSection c={c} />
      <PatchesSection c={c} />
      <MidiSection c={c} />
      <ProjectorsSection c={c} />
      <MappingSection c={c} />
      <MarkSection c={c} />
      <SimulationSection c={c} />
      <MacroSection c={c} />
      <SquishSection c={c} />
      <OilSection c={c} />
      <FerroSection c={c} />
      <ReactionsSection c={c} />
      <InteractionSection c={c} />
      <LiquidsSection c={c} />
      <TiltSection c={c} />
      <SpinSection c={c} />
      <PhysicsSection c={c} />
      <AutomationSection c={c} />
      <LayersSection c={c} />

      {/*
        The panel used to be one long scroll and this was its footer: one line
        of history at the bottom of everything. It is now seventeen sections
        shown one at a time, so that footer sits under every one of them — a
        note about the Squish Plate under Controller, under Sound, under
        Projectors. A line of flavour in the wrong place reads as a mistake,
        which is worse than no line at all, so it has gone rather than been
        repeated seventeen times or guarded by a condition.
      */}
    </>
  );

  if (embed) {
    return (
      <PinContext.Provider value={null}>
        <div className="min-w-0 pt-1" data-testid={`settings-embed-${embed}`}>{sections}</div>
      </PinContext.Provider>
    );
  }

  return (
    <Sheet title={scope === 'stage' ? 'Stage' : 'Settings'} onClose={onClose} width={scope === 'stage' ? 720 : 1000} height={scope === 'stage' ? 520 : 860} testId={scope === 'stage' ? 'stage-sheet' : 'settings-panel'}>
      <PinContext.Provider value={pins ?? null}>
      {/*
        A rail and a pane, and the sheet is wider than the other two to hold
        them. Settings is the one sheet with ninety controls in it; the others
        ask one question each and stay at the handoff's 720.

        On a phone the rail becomes a strip across the top: 1000px of sheet on
        a 390px screen is the sheet's own `max-w-full`, and a 216px column
        taken out of that leaves nothing to put a slider in.

        The tabs are full width only in the column. In the strip, a tab of
        `w-full` took its group's whole width, the group being as wide as its
        labels laid end to end, so each group's tabs ran on past it and lay
        under the next group: measured at 390 px, the Inputs group's six tabs
        spanned 140 to 3180 px in a group 505 px wide, and 13 of the 26 tabs
        could not be tapped (`npm run phone`): Mixer, every Inputs tab but
        Sound (Patches among them), three of Look's and four of Plate's.
      */}
      <div className="flex min-h-0 w-full flex-1 flex-col sm:flex-row">

        {/* ── Where you are ─────────────────────────────────── */}
        <nav
          className="flex max-h-[38%] shrink-0 gap-1 overflow-x-auto overflow-y-auto border-b border-white/10 bg-black/20 p-2 sm:max-h-none sm:w-[220px] sm:flex-col sm:border-b-0 sm:border-r sm:px-3 sm:py-3"
          aria-label="Settings sections"
          data-testid="settings-rail"
        >
          {railGroups.length === 0 && (
            <p className="p-2 text-[11px] text-white/35">Nothing matches.</p>
          )}
          {railGroups.map(group => (
            <div key={group.id} className="shrink-0 sm:shrink" data-testid={`rail-group-${group.id}`} data-group={group.id}>
              {/* The seven headings are drawn on a phone too (PLAN 35b): the strip was one flat run of 26 tabs with these hidden, so the phone had no way to see that Squish Plate is chemistry or that Film is a feed. */}
              <div className="whitespace-nowrap px-3 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/40 sm:pb-1.5 sm:pt-4" title={group.hint} data-testid={`rail-heading-${group.id}`}>
                <span className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full align-[0.5px]" style={{ background: 'var(--cap)' }} aria-hidden />
                {group.name}
              </div>
              <div className="flex gap-0.5 sm:flex-col">
                {group.rows.map(row => (
                  <button
                    key={row.id}
                    onClick={() => { setSection(row.id); setQuery(''); }}
                    aria-current={!q && section === row.id ? 'page' : undefined}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-[7px] text-left text-[13px] transition-colors sm:w-full sm:whitespace-normal ${
                      !q && section === row.id
                        ? 'bg-accent-bg font-medium text-white shadow-[inset_2px_0_0_var(--color-accent)]'
                        : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                    }`}
                    data-testid={`settings-nav-${row.id}`}
                  >
                    {row.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── What is in it ─────────────────────────────────── */}
        <div ref={paneRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-7 py-6">

      {/*
        A box to type into.

        Seventeen sections and ninety controls is past what anyone browses, and
        a rail alone does not fix that: it tells you where things are once you
        know what they are called. A search is the answer to "where is the
        thing that turns the camera on", and it searches what each section is
        *about* rather than only what it is called — "video", "people" and
        "crowd" all find The Room, none of which is in its heading. While a
        query is in the box the rail narrows to the hits and the pane shows all
        of them at once, which is what a result list is.
      */}
      <div className="relative mb-5">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search every setting — try “camera”, “people”, “keystone”"
          aria-label="Search settings"
          data-testid="settings-search"
          className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[13px] text-white/90 outline-none transition-colors placeholder:text-white/30 focus:border-accent-border focus:bg-white/[0.05]"
        />
        {q && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear the search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[12px] text-white/40 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>
      {q && visibleCount === 0 && (
        <p className="mb-6 text-[12px] text-white/40" data-testid="settings-no-match">
          Nothing here matches “{query}”.
        </p>
      )}

      {sections}
      {isTierGatingEnforced() && getEffectiveTier() !== 'pro' && (
        <section
          data-cg-app-tiles=""
          data-cg-effective-tier={getEffectiveTier()}
          className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-amber-200">
              In the ChromaGlass app
            </span>
            <button
              type="button"
              onClick={openAccountSheet}
              className="text-[11px] font-semibold text-amber-200 underline underline-offset-2 hover:text-amber-100"
            >
              {getEffectiveTier() === 'home' ? 'Upgrade to Pro →' : 'Get Home or Pro →'}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {APP_FEATURE_TILES.filter((t) => (getEffectiveTier() === 'home' ? t.tier === 'pro' : true)).map((tile) => (
              <div
                key={tile.id}
                data-cg-app-tile={tile.id}
                data-cg-tile-tier={tile.tier}
                onClick={openAccountSheet}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAccountSheet(); } }}
                className="cursor-pointer rounded-lg border border-white/10 bg-black/40 p-2.5 text-[12px] leading-snug transition-colors hover:border-amber-500/40 hover:bg-black/60"
              >
                <div className="flex items-center justify-between gap-2 font-medium text-neutral-100">
                  <span>{tile.title}</span>
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
                    {tile.tier}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-neutral-400">{tile.summary}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {scope === 'stage' && (
        <p className="mt-2 text-[12px] text-dim" data-testid="stage-sheet-rule">
          The room and the machine: nothing here saves into a look.
        </p>
      )}
        </div>
      </div>
      </PinContext.Provider>
    </Sheet>
  );
};
