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
  // Since PLAN 35c-7 the sources draw the section's own picker under the Mic: still one select, the section's.
  check('the microphone is picked in Sound\'s one Input, drawn under the Mic, and the sources draw no picker of their own',
    /data-testid="audio-input"/.test(panel) && /onAudioInput=\{chooseAudioInput\}/.test(readFileSync(join(root, 'src/App.tsx'), 'utf8'))
    && sheetProps.includes('inputPicker=') && !/chooseAudioInput|onInput|inputId=/.test(sheetProps)
    && !/value=\{inputId\}|sound-input-picker|onAudioInput/.test(soundSheet)
    && /source === 'microphone' && inputPicker/.test(soundSheet) && (panel.match(/data-testid="audio-input"/g) ?? []).length === 1);
  /*
    One page for sound (PLAN 35c-7, the owner 2026-11-10: "I don't understand
    why there are two sound settings pages"). The Sound sheet, drawn on Setup
    as the Music & Drone panel beside Sound, is the top of Sound now: no sheet
    to open, no panel of its own (a saved layout's is Sound, by
    MERGED_SECTIONS), and neither half sends you to the other. Asked from both
    ends, so a sheet or panel put back is red, and so is the merge taken away.
    The Cues panel's Save keeps the set, the plate bar's the look.
  */
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  const layoutSrc = readFileSync(join(root, 'src/lib/deskLayout.ts'), 'utf8');
  const mapSrc = readFileSync(join(root, 'src/lib/settingsMap.ts'), 'utf8');
  check('sound is one page: no Sound sheet, no Music & Drone panel (its id lands on Sound), no Change in Sound… or Change… between halves',
    !/showSound|setShowSound|<Sheet/.test(app.match(/const soundScreen[\s\S]*?\n {2}\);/)?.[0] ?? 'missing') && !/showSound/.test(app)
    && !/id: 'player'/.test(layoutSrc) && /\n {2}player: 'audio-input',/.test(mapSrc)
    && !/onOpenSound|Change in Sound|sound-input-open|onPickMic/.test(app + panel + soundSheet));
  // One page for sound (PLAN 35c-7): the sources are the top of the Sound section the dot opens, the device under the Mic.
  check('and the Sound section draws where the sound comes from at its top, with the device under the Mic',
    panel.includes('{soundSources ? soundSources(inputPicker) : inputPicker}') && panel.includes('data-testid="audio-input"')
    && /soundSources=\{soundScreen\}/.test(app));
  // One home each (PLAN 35c-3): the switch is drawn once; since 35c-7 there is no sheet or state row to draw a second.
  check('and the source is chosen by the Sound section\'s own tiles alone',
    !panel.includes('testId="audio-source"') && !panel.includes('audio-source-state') && !panel.includes('audio-source-open')
    && readFileSync(join(root, 'src/components/SoundPanel.tsx'), 'utf8').includes('sound-source-${s.id}'));
  check('the set\'s Save says it is the set\'s, the plate bar\'s Save is the look\'s',
    /saved \? 'Saved' : 'Save set'/.test(deskPanelsSrc) && !/saved \? 'Saved' : 'Save'\}/.test(deskPanelsSrc));
}
