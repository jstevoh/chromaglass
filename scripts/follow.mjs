import { analysePcm } from '../src/lib/audioFeatures.ts';
import { SOUND_SOURCES } from '../src/lib/audioFeatures.ts';

const SAMPLE_RATE = 48000;
const FPS = 60;
const DURATION_SEC = 2.0;

const pcm = new Float32Array(SAMPLE_RATE * DURATION_SEC);

for (let i = 0; i < pcm.length; i++) {
  const t = i / SAMPLE_RATE;
  if (t > 0.1 && t < 0.6) {
    const val = 2 * (t * 440 - Math.floor(t * 440 + 0.5)); 
    pcm[i] = val * 0.5;
  }
  if (t > 1.2 && t < 1.3) {
    pcm[i] = (Math.random() * 2 - 1) * 0.5;
  }
}

const readings = analysePcm(pcm, SAMPLE_RATE, FPS);

let maxToneNoteLevel = 0;
let maxSnareNoteLevel = 0;
let maxToneSnareLevel = 0;
let maxSnareSnareLevel = 0;

for (let r of readings) {
  const t = r.time;
  if (t > 0.2 && t < 0.5) {
    if (r.note > maxToneNoteLevel) maxToneNoteLevel = r.note;
    if (r.snare > maxToneSnareLevel) maxToneSnareLevel = r.snare;
  }
  if (t > 1.2 && t < 1.35) {
    if (r.note > maxSnareNoteLevel) maxSnareNoteLevel = r.note;
    if (r.snare > maxSnareSnareLevel) maxSnareSnareLevel = r.snare;
  }
}

console.log("Tone section (0.2 - 0.5s):");
console.log(`  note level:  ${maxToneNoteLevel.toFixed(3)}`);
console.log(`  snare level: ${maxToneSnareLevel.toFixed(3)}`);

console.log("\nSnare section (1.2 - 1.35s):");
console.log(`  note level:  ${maxSnareNoteLevel.toFixed(3)}`);
console.log(`  snare level: ${maxSnareSnareLevel.toFixed(3)}`);

if (maxToneNoteLevel > maxToneSnareLevel && maxSnareSnareLevel > maxSnareNoteLevel) {
  console.log("\nSUCCESS: 'note' prefers the sustained tone, while 'snare' prefers the percussive hit.");
} else {
  console.log("\nFAILED: Levels did not behave as expected.");
}
