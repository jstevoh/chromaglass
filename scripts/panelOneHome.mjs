/**
 * One home each: the `panel` check's questions about controls drawn in two
 * places, kept beside it because `panel.mjs` is held at its size ceiling
 * (`npm run sizes`). Each takes the sources `panel.mjs` has already read.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function oneHome({ check, root, panel, header, deskSrc, deskPanelsSrc }) {
  // A line telling you where to go, where a button could take you: the header's
  // MIDI light, on every tab. The rides' own "set one up" button did the same
  // thing a few hundred pixels below it and went in PLAN 35c-5.
  check('the no-controller route is the MIDI light, which says so, and the rides draw no second way there',
    /'No controller\. Click to set one up\.'/.test(header) && /onClick=\{onMidi\}/.test(header)
    && !/no-controller-hint|onMidi/.test(deskPanelsSrc) && !/Settings → MIDI to learn one/.test(deskPanelsSrc));

  /*
    One home each, the second sweep (PLAN 35c-5). Each of these was one setting
    or one action drawn in two panels, found by reading every tab, the Settings
    sections, the Sound sheet and the phone's sheets side by side; each pair is
    asked from both ends, so a copy put back in either place is red, and so is
    the home taken away with it.
  */
  const soundSheet = readFileSync(join(root, 'src/components/SoundPanel.tsx'), 'utf8');
  check('All settings… is the status bar\'s alone, not the rides\' or the recipe\'s too',
    /data-testid="open-all-settings"/.test(deskSrc) && !/All settings|onOpenSettings|open-all-settings/.test(deskPanelsSrc));
  check('Beat Prediction is the Sound section\'s slider, not a switch on the rides as well',
    /settingKey="beatPrediction"/.test(panel) && !/beatPrediction/.test(deskPanelsSrc));
  check('what turns the plates with the music is chosen in Plate Spin, not in Sound\'s wiring too',
    /data-testid="spin-audio-route"/.test(panel) && /\['velocity', 'density', 'color'\]\.map/.test(panel)
    && !/'rotation'/.test(panel) && /goTo\('spin', 'sound'\)/.test(panel));
  // The sheet is not handed the device's setter at all, so no control of its can pick one.
  const sheetProps = readFileSync(join(root, 'src/App.tsx'), 'utf8').match(/<SoundPanel[\s\S]*?\/>/)?.[0] ?? '';
  check('the microphone is picked in Settings\' Input, and the Sound sheet says which and leads there',
    /data-testid="audio-input"/.test(panel) && /onAudioInput=\{chooseAudioInput\}/.test(readFileSync(join(root, 'src/App.tsx'), 'utf8'))
    && sheetProps.includes('inputId=') && !/chooseAudioInput|onInput/.test(sheetProps)
    && !/value=\{inputId\}|sound-input-picker/.test(soundSheet)
    && /data-testid="sound-input-open"/.test(soundSheet) && /onPickMic\(\)/.test(soundSheet));
  /*
    And two that were one thing named twice or opened twice. Sound's Change in
    Sound… opens the Sound sheet, which on Setup is already out as the Music &
    Drone panel; a section drawn as a panel is handed no way there while that
    panel is on the tab (the Settings sheet keeps it, which qa and opensource
    drive). The Cues panel's Save keeps the set, the plate bar's the look.
  */
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  check('a section on a tab with Music & Drone out draws no Change in Sound…, the sheet keeps it',
    /const sectionPanel = [^\n]*whereIs\(deskLayout, 'player'\) && \{ onOpenSound: undefined \}/.test(app)
    && (app.match(/settingsPanel\(\{ embed: id/g) ?? []).length === 1 && /onOpenSound=\{\(\) => \{/.test(app)
    && /\{onOpenSound && \(/.test(panel));
  check('the set\'s Save says it is the set\'s, the plate bar\'s Save is the look\'s',
    /saved \? 'Saved' : 'Save set'/.test(deskPanelsSrc) && !/saved \? 'Saved' : 'Save'\}/.test(deskPanelsSrc));
}
