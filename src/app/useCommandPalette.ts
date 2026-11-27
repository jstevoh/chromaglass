import { useState, useMemo, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { Command } from '../components/desk/CommandPalette';
import { DESK_TOOLS } from '../components/desk/tools';
import { isUserPresetId, type UserPreset } from '../lib/userPresets';
import { PRESET_CONTRACTS } from '../presetPlate';
import { PALETTE } from '../constants';
import { makesText, runningText, type RecordChoice } from '../lib/recordChoice';
import { openCrashReport } from '../components/CrashReportButton';
import { FEEDBACK_PANE } from '../lib/feedback';
import { SETTINGS_SECTIONS, sectionSearchText } from '../lib/settingsMap';
import { PANELS, openPanel, panelSearchText, raiseFloating, whereIs } from '../lib/deskLayout';
import { liveAvailable } from '../lib/liveShow';
import { SHORTCUT_KBD, matchesShortcut } from '../lib/shortcuts';
import type { Preset } from '../presets';
import type { VisualizerSettings } from '../types';
import type { ScreenLike } from '../hooks/useCastSession';
import type { Recorder } from '../hooks/useRecorder';
import type { Cue } from '../components/desk/deskProps';
import type { useDeskTabs } from '../hooks/useDeskLayout';

/** The letter printed on each tool, and the tool it picks (matches `DESK_TOOLS`). */
const TOOL_KEYS: Record<string, (typeof DESK_TOOLS)[number][0]> = {
  d: 'dropper', s: 'spray', x: 'splatter', o: 'pour', k: 'streak', w: 'blow', p: 'press', g: 'finger', m: 'magnet', n: 'spin',
};

/**
 * The command palette's list (⌘K) and the keyboard: every look, action,
 * setting section and desk as a command, and the keys that run them.
 */
interface CommandPaletteDeps {
  allPresets: Preset[];
  userPresetsRef: RefObject<UserPreset[]>;
  performing: boolean;
  cueLook: (presetId: string) => void;
  cuePreset: (presetId: string) => void;
  goLookNow: (presetId: string, seconds?: number) => void;
  goLook: (seconds?: number | undefined) => void;
  revertLook: () => void;
  blackout: boolean;
  toggleBlackout: () => void;
  newLook: () => void;
  saveLook: () => void;
  docId: string | null;
  docName: string;
  replaceLook: () => void;
  setSeedCount: Dispatch<SetStateAction<number>>;
  setClearTrigger: Dispatch<SetStateAction<number>>;
  setDrainTrigger: Dispatch<SetStateAction<number>>;
  clearPlate?: () => void;
  drainPlate?: () => void;
  isActive: boolean;
  setIsActive: Dispatch<SetStateAction<boolean>>;
  isAutomated: boolean;
  setIsAutomated: Dispatch<SetStateAction<boolean>>;
  settings: VisualizerSettings;
  updateSettings: (patch: Partial<VisualizerSettings>) => void;
  recordingAny: boolean;
  recordChoice: RecordChoice;
  toggleRecording: () => void;
  perfLive: boolean;
  togglePerformance: () => void;
  setShowRecordPanel: Dispatch<SetStateAction<boolean>>;
  triggerLucky: () => void;
  hideOverlays: () => void;
  setSettingsSection: Dispatch<SetStateAction<string | null>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  setShowHelp: Dispatch<SetStateAction<boolean>>;
  openAllSettings: () => void;
  setShowMidi: Dispatch<SetStateAction<boolean>>;
  setShowSequencer: Dispatch<SetStateAction<boolean>>;
  showActivity: boolean;
  setShowActivity: Dispatch<SetStateAction<boolean>>;
  setShowSongs: Dispatch<SetStateAction<boolean>>;
  startCast: (mode?: "window" | "device", screen?: ScreenLike | null | undefined) => Promise<void>;
  deskTabs: ReturnType<typeof useDeskTabs>;
  setDeskTab: (id: string) => void;
  setShowStage: Dispatch<SetStateAction<boolean>>;
  recorder: Recorder;
  deskUp: boolean;
  sendToWallRef: RefObject<() => void>;
  setActiveTool: Dispatch<SetStateAction<"dropper" | "spray" | "splatter" | "pour" | "streak" | "blow" | "press" | "finger" | "magnet" | "spin">>;
  designing: boolean;
  cuesRef: RefObject<Cue[]>;
  cueAny: (id: string) => void;
}

export function useCommandPalette({
  allPresets, userPresetsRef, performing, cueLook, cuePreset, goLookNow, goLook, revertLook,
  blackout, toggleBlackout, newLook, saveLook, docId, docName, replaceLook, setSeedCount,
  setClearTrigger, setDrainTrigger, clearPlate, drainPlate, isActive, setIsActive, isAutomated, setIsAutomated, settings,
  updateSettings, recordingAny, recordChoice, toggleRecording, perfLive, togglePerformance,
  setShowRecordPanel, triggerLucky, hideOverlays, setSettingsSection, setShowSettings, setShowHelp,
  openAllSettings, setShowMidi, setShowSequencer, showActivity, setShowActivity, setShowSongs,
  startCast, deskTabs, setDeskTab, setShowStage, recorder, deskUp, sendToWallRef, setActiveTool,
  designing, cuesRef, cueAny,
}: CommandPaletteDeps) {
  // ── ⌘K, and the keys a hand finds in the dark ───────────────────
  /*
    The desk shows six rides and a cue list and nothing else, because those
    are what a hand is on during a set. Everything else the app can do stays
    one keystroke away instead of one more panel: ⌘K opens a box, you type
    three letters, you press Enter.

    The keys themselves are the same commands, without the box. They are
    printed on the buttons that share them — a shortcut nobody can see is a
    shortcut nobody uses.
  */
  const [showPalette, setShowPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const openDeskPanel = (id: string) => {
    deskTabs.update(deskTabs.tab, (l) => {
      const next = whereIs(l, id) ? l : openPanel(l, id, 'deck');
      const uncollapsed = next.collapsed.includes(id)
        ? { ...next, collapsed: next.collapsed.filter(x => x !== id) }
        : next;
      return whereIs(uncollapsed, id) === 'float' ? raiseFloating(uncollapsed, id) : uncollapsed;
    });
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-panel="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
  };

  const paletteCommands = useMemo<Command[]>(() => {
    const looks: Command[] = allPresets.map(pr => {
      const contract = isUserPresetId(pr.id)
        ? userPresetsRef.current.find(u => u.id === pr.id)?.contract
        : PRESET_CONTRACTS[pr.id];
      const [a, b] = contract && contract.length
        ? [PALETTE[contract[0]]?.hex ?? '#666', PALETTE[contract[1] ?? contract[0]]?.hex ?? '#333']
        : ['#52525B', '#27272A'];
      return {
        id: `look-${pr.id}`,
        name: pr.name,
        kind: 'Preset palettes',
        look: true,
        hint: (contract ?? []).map(i => PALETTE[i]?.name ?? '').join(' '),
        swatch: `linear-gradient(135deg, ${a}, ${b})`,
        // In Perform a look is armed, not applied: the wall does not cut
        // because someone searched. ⇧⏎ is the one that sends it.
        run: () => { if (performing) cueLook(pr.id); else cuePreset(pr.id); },
        runNow: () => { if (performing) goLookNow(pr.id); else cuePreset(pr.id); },
      };
    });

    const runningWhat = runningText({ videoOn: recorder.recording, takeOn: perfLive });
    const doing: Command[] = [
      { id: 'go',        name: 'Go — send the cued look',   kind: 'Actions', kbd: SHORTCUT_KBD.go,       run: () => goLook() },
      { id: 'back',      name: 'Back — undo the last look', kind: 'Actions', kbd: SHORTCUT_KBD.back,     run: () => revertLook() },
      { id: 'blackout',  name: blackout ? 'Lights up' : 'Blackout', kind: 'Actions', kbd: SHORTCUT_KBD.blackout, run: toggleBlackout },
      { id: 'new',       name: 'New — an empty plate',      kind: 'Actions', run: newLook },
      { id: 'save',      name: 'Save as a new preset…',     kind: 'Actions', kbd: SHORTCUT_KBD.save,     run: saveLook },
      ...(docId ? [{ id: 'save-over', name: `Save over “${docName}”`, kind: 'Actions' as const, run: replaceLook }] : []),
      { id: 'seed',      name: 'Seed the plate',            kind: 'Actions', run: () => setSeedCount(v => v + 1) },
      { id: 'clear',     name: 'Clear the plate',           kind: 'Actions', run: () => (clearPlate ?? (() => setClearTrigger(v => v + 1)))() },
      { id: 'drain',     name: 'Drain the plate',           kind: 'Actions', run: () => (drainPlate ?? (() => setDrainTrigger(v => v + 1)))() },
      { id: 'freeze',    name: isActive ? 'Freeze the liquid' : 'Thaw the liquid', kind: 'Actions', kbd: SHORTCUT_KBD.freeze, run: () => setIsActive(v => !v) },
      { id: 'evolve',    name: isAutomated ? 'Stop evolving' : 'Evolve on its own', kind: 'Actions', run: () => setIsAutomated(v => !v) },
      { id: 'record-video',       name: recordingAny ? `Stop recording (${runningWhat})` : `Record: ${makesText(recordChoice)}`, kind: 'Actions', kbd: SHORTCUT_KBD.record, run: toggleRecording },
      // Opening "Record a take" from the palette opens the Record panel so the performer sees what is captured instead of starting live at once (H5-02).
      { id: 'record-performance', name: perfLive ? 'Stop the take' : 'Record a take (your strokes and drops, replayable)', kind: 'Actions', run: perfLive ? togglePerformance : () => setShowRecordPanel(true) },
      { id: 'record-studio',      name: 'Record options…', kind: 'Actions', terms: 'record video take clip portrait quality audio', run: () => setShowRecordPanel(true) },
      { id: 'report',    name: 'Report a problem — save what the show was doing', kind: 'Actions', run: openCrashReport },
      // Settings → Feedback (PLAN 39a): not a section, so not one of the section rows below.
      { id: 'feedback',  name: 'Send feedback — a bug, an idea, or what you love', kind: 'Actions', run: () => { setSettingsSection(FEEDBACK_PANE); setShowSettings(true); } },
      { id: 'lucky',     name: 'Randomise the look (replaces everything)', kind: 'Actions', run: triggerLucky },
      { id: 'hide',      name: 'Clean screen — hide all controls', kind: 'Actions', run: hideOverlays },
    ];

    /*
      Every settings section, one row each.

      A single "Settings" row put sixteen sections and eighty controls behind a
      word that describes none of them — and the panel then opened on the half
      that did not contain the room camera, the projectors, the solver or the
      physics. Typing "room" or "keystone" or "people" now lands on the section
      itself rather than on the top of a panel that has it somewhere.
    */
    const sections: Command[] = SETTINGS_SECTIONS.map(sec => ({
      id: `settings-${sec.id}`,
      name: `Settings: ${sec.name}`,
      // Matched as well as the name: the section's terms and every label in
      // it, so "keystone", "flash" or "dimmer" land on the section they live in.
      terms: sectionSearchText(sec),
      kind: 'Open',
      run: () => { setSettingsSection(sec.id); setShowSettings(true); setShowHelp(false); },
    }));

    // Built from the same `PANELS` registry the desk uses, so any new panel is
    // searchable in ⌘K without editing the palette (H7-01).
    const panels: Command[] = PANELS
      .filter(p => !(p.id === 'live' && !liveAvailable()))
      .map(p => ({
        id: `panel-${p.id}`,
        name: `Panel: ${p.name}`,
        kind: 'Panels',
        terms: panelSearchText(p),
        run: () => openDeskPanel(p.id),
      }));

    const opening: Command[] = [
      // Named for the words on the button that does the same thing. It read
      // "Settings", so typing what the button says — "all settings" — matched
      // nothing at all, out of sixty-eight commands.
      { id: 'open-settings', name: 'All settings', kind: 'Open', terms: 'settings preferences config', run: openAllSettings },
      { id: 'open-midi',      name: 'MIDI',            kind: 'Open', terms: 'midi controller mapping learn', run: () => { setShowMidi(true); setShowSequencer(false); } },
      { id: 'midi-activity',  name: showActivity ? 'Hide what the controller is doing' : 'Show what the controller is doing',
        kind: 'Open', run: () => setShowActivity(v => !v) },
      { id: 'open-songs',     name: 'Songs',           kind: 'Open', terms: 'songs tracks music setlist shows', run: () => { setShowSongs(true); setShowMidi(false); } },
      { id: 'open-seq',       name: 'Stage sequences', kind: 'Open', hint: 'Sequencer', terms: 'sequencer sequence stages cues timeline', run: () => { setShowSequencer(true); setShowMidi(false); } },
      { id: 'open-guide',     name: 'Guide',           kind: 'Open', terms: 'manual guide documentation help', run: () => { setShowHelp(true); setShowSettings(false); } },
      { id: 'open-shortcuts', name: 'Keyboard shortcuts', kind: 'Open', kbd: SHORTCUT_KBD.shortcuts, terms: 'shortcuts keyboard keys cheatsheet hotkeys help', run: () => setShowShortcuts(true) },
      { id: 'open-wall',      name: 'Send the show to a window', kind: 'Open', terms: 'wall projector window cast display', run: () => { void startCast('window'); } },
      // A command for each of the desk's tabs, by the name it has now.
      ...deskTabs.tabs.map(t => ({ id: `open-tab-${t.id}`, name: `${t.name} tab`, kind: 'Open' as const, run: () => setDeskTab(t.id) })),
      { id: 'open-stage',     name: 'Stage: the room and the machine', kind: 'Open', kbd: SHORTCUT_KBD.stage, terms: 'stage room wall machine', run: () => { setShowStage(true); setShowSettings(false); } },
    ];

    return [...looks, ...doing, ...opening, ...panels, ...sections];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPresets, performing, blackout, isActive, isAutomated, recorder.recording, perfLive, recordingAny, recordChoice, deskTabs.tabs, deskTabs.tab, setDeskTab, docId, docName,
      cueLook, cuePreset, goLook, goLookNow, revertLook, toggleBlackout, toggleRecording, togglePerformance, hideOverlays, showActivity]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement | null)?.isContentEditable;

      // ⌘K works everywhere, including out of a text field, because that is
      // the one key whose whole job is to get you out of where you are.
      if (matchesShortcut(e, 'palette')) {
        e.preventDefault();
        setShowPalette(v => !v);
        return;
      }
      /*
        ⌘S on either desk, shifted or not. It was the Design desk's alone,
        though the Perform desk's Save button wears the same ⌘S: pressed in
        Perform it reached the browser, which offered to save the web page.
        Measured in `npm run saves`. The shifted one, Save as, had a branch of
        its own after this one that it never reached (this one took any S
        with ⌘ held); with Save always asking for a name the two are one.
      */
      if (deskUp && (e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveLook();
        return;
      }
      // ⌘⏎ is Send to wall, as the header's Wall is on every tab.
      if (deskUp && matchesShortcut(e, 'wall')) {
        e.preventDefault();
        sendToWallRef.current();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (matchesShortcut(e, 'blackout')) { toggleBlackout(); return; }
      if (matchesShortcut(e, 'shortcuts')) {
        e.preventDefault();
        setShowShortcuts(v => !v);
        return;
      }
      if (!deskUp) return;          // the narrow-screen UI has its own keys

      // The tools are the same letters on both desks; Design has all eight.
      // The Perform desk's four are the ones that work the liquid already on
      // the plate rather than adding more of it — and the finger is one of
      // those, which is why G belongs in this list and not only in Design.
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      // Both desks carry every tool now, so every tool's key works on both.
      if (tool) {
        setActiveTool(tool);
        return;
      }
      if (matchesShortcut(e, 'freeze')) { setIsActive(v => !v); return; }
      if (matchesShortcut(e, 'take')) { togglePerformance(); return; }
      if (matchesShortcut(e, 'record')) { toggleRecording(); return; }

      // The rest are the show's, and only while the desk is up: on the bench
      // Space should not fire a look change at a room.
      // Nor with the plate in Preview: the bar says "not on wall", so a key
      // that sends a look to the room would make it a lie.
      if (!performing || designing) return;
      if (matchesShortcut(e, 'go')) { e.preventDefault(); goLook(); return; }
      if (matchesShortcut(e, 'back')) { e.preventDefault(); revertLook(); return; }
      // 1–9 arm the first nine cues. Arm, not fire: the number picks the look
      // and Space sends it, which is how a lighting desk has always worked.
      if (e.key >= '1' && e.key <= '9') {
        const cue = cuesRef.current[Number(e.key) - 1];
        if (cue) cueAny(cue.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performing, designing, deskUp, goLook, revertLook, cueAny, toggleBlackout, togglePerformance, toggleRecording]);

  return {
    showPalette, setShowPalette, showShortcuts, setShowShortcuts, paletteCommands,
  };
}
