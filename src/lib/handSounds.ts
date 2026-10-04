/**
 * The operator's own hand, as the microphone hears it (PLAN.md 14w).
 *
 * What was reported: pressing a control (the Speed ride, a tool) sometimes
 * made the plate pulse, as if it had taken a beat or a press. The show was on
 * the laptop's microphone. A trackpad's click, a mouse button, a key, a finger
 * landing on a phone's glass: each is a sharp knock a few centimetres from the
 * microphone, carried through the case as much as through the air, and the
 * ear's onsets (`audioFeatures.ts`) are built to call exactly that, a sudden
 * arrival of energy, a kick. The plate then did what it does on a kick: the
 * squeeze, the centre pulse, the ring, the rock.
 *
 * Measured by `npm run clicks`. In arithmetic (the analyser emulated, a click
 * a broadband tick with a short thump), in a quiet room the ear called a kick
 * on every click, 46 of 46; with the show's band playing and clicks at a third
 * of its peak, 43 kicks the band never played, and the beat clock fired 303
 * kicks for the band's 258. In the app, on a stand-in microphone that knocks
 * as it is pressed, 10 kicks for 10 presses on the Perform desk and 9 for 9
 * taps on the phone. With this: none, none and none, and 257 of the 258.
 *
 * Why the moment of the gesture, and not something about how a click sounds.
 * A click and a snare are both short broadband arrivals, and a thump through
 * the case is a kick's own band; any rule that told them apart by ear would
 * also lose real drums. The page knows something the sound does not: when the
 * hand moved. So a reading taken in the quarter of a second after a gesture
 * may call no onset. The levels still move, so the plate is
 * not deafened, and a beat clock that has locked keeps its predicted beats
 * through the window, so a hand riding a fader on a steady song loses none.
 *
 * Only on the microphone (`useAudioAnalyzer`'s `hearsRoom`). A song, the
 * band, the drone and a shared tab come down a wire the hand is not on.
 *
 * The window: the event is stamped when the input arrived (`timeStamp`, the
 * page's clock), within a few milliseconds of the knock. The knock reaches
 * the analyser after the input's latency (about 10–40 ms on a laptop, more
 * on a Bluetooth headset), sits in its 1024-sample window for about 21 ms,
 * and the node's smoothing carries the rise into the next reading or two. A
 * quarter of a second after the stamp covers all of that with a headset's
 * latency to spare, and at the band's 122 bpm it is half a beat, so one
 * gesture costs at most one heard kick.
 *
 * What it cannot do: gate a reading taken before the page has handled the
 * event. The browser hands input over at the start of a frame and the ear
 * reads in that frame's animation callbacks, after it, so a reading is late
 * to the mark only when the knock reached the analyser sooner than the event
 * reached the page; `npm run clicks` measures a frame's delay in handling it
 * against a laptop's input latency, and PLAN.md 14w holds the rest.
 */

/** How long after a gesture's stamp a reading may still hold its sound, seconds. */
export const HAND_HEARD_FOR_S = 0.25;

/** The gestures of the last moment, on the ear's clock (seconds). */
export class HandSounds {
  private marks: number[] = [];
  /** Gestures marked since the page loaded, for a check. */
  count = 0;

  /** A gesture that makes a sound, at `t` seconds on the ear's clock. */
  mark(t: number): void {
    this.marks.push(t);
    this.count++;
    // A handful is all that can matter at once: a mark is forgotten as soon
    // as it is older than its window, and a burst of keys never reaches this.
    if (this.marks.length > 16) this.marks.shift();
  }

  /** Whether a reading taken at `t` seconds may hold the sound of a gesture. */
  covers(t: number): boolean {
    for (const m of this.marks) if (t >= m && t <= m + HAND_HEARD_FOR_S) return true;
    return false;
  }
}

/** The page's own: one hand, whichever ear is listening. */
export const handSounds = new HandSounds();

/**
 * Mark the gestures that make a sound, on `target` (the window), in the
 * capture phase so that nothing a control does with the event can hide it.
 *
 * A press and a release are both clicks on a mouse and on a trackpad, so
 * both are marked; a finger lifting off glass makes no sound, so a touch is
 * marked only as it lands. Keys on the way down and up, but not the repeats
 * of one held down, which make none.
 */
export function listenForHands(target: Window, hands: HandSounds = handSounds): () => void {
  const at = (e: Event) => (e.timeStamp > 0 ? e.timeStamp : performance.now()) / 1000;
  const down = (e: Event) => hands.mark(at(e));
  const up = (e: PointerEvent) => { if (e.pointerType !== 'touch') hands.mark(at(e)); };
  const key = (e: KeyboardEvent) => { if (!e.repeat) hands.mark(at(e)); };
  target.addEventListener('pointerdown', down, true);
  target.addEventListener('pointerup', up, true);
  target.addEventListener('keydown', key, true);
  target.addEventListener('keyup', key, true);
  return () => {
    target.removeEventListener('pointerdown', down, true);
    target.removeEventListener('pointerup', up, true);
    target.removeEventListener('keydown', key, true);
    target.removeEventListener('keyup', key, true);
  };
}
