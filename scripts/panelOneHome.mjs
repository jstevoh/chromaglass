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
    && !/no-controller-hint|onClick=\{p\.onMidi\}/.test(deskPanelsSrc) && !/Settings → MIDI to learn one/.test(deskPanelsSrc));

  /*
    One home each, the second sweep (PLAN 35c-5). Each of these was one setting
    or one action drawn in two panels, found by reading every tab, the Settings
    sections, the Sound sheet and the phone's sheets side by side; each pair is
    asked from both ends, so a copy put back in either place is red, and so is
    the home taken away with it.
  */
  const soundSheet = readFileSync(join(root, 'src/components/SoundPanel.tsx'), 'utf8');
  const phonePlay = readFileSync(join(root, 'src/components/phone/PhonePlay.tsx'), 'utf8');
  const phoneStage = readFileSync(join(root, 'src/components/phone/PhoneStage.tsx'), 'utf8');
  check('All settings… is the status bar\'s alone, not the rides\' or the recipe\'s too',
    /data-testid="open-all-settings"/.test(deskSrc) && !/>All settings…</.test(deskPanelsSrc) && !/open-all-settings/.test(deskPanelsSrc));
  check('Beat Prediction is the Sound section\'s slider, not a switch on the rides as well',
    /settingKey="beatPrediction"/.test(panel) && !/beatPrediction/.test(deskPanelsSrc));
  check('what turns the plates with the music is chosen in Plate Spin, not in Sound\'s wiring too',
    /data-testid="spin-audio-route"/.test(panel) && /\['velocity', 'density', 'color'\]\.map/.test(panel)
    && !/'color', 'rotation'/.test(panel) && /goTo\('spin', 'sound'\)/.test(panel));
  check('the microphone is picked in Settings\' Input, and the Sound sheet says which and leads there',
    /data-testid="audio-input"/.test(panel) && !/<select[^>]*\n?[^>]*onInput|sound-input-picker/.test(soundSheet)
    && /data-testid="sound-input-open"/.test(soundSheet) && /onPickMic\(\)/.test(soundSheet));
  check('the phone: Evolve Speed is the Motion sheet\'s, under its switch, not a Play slider too',
    /testId="phone-evolve-speed"/.test(phoneStage) && !/automateRate/.test(phonePlay));
}
