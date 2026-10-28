/**
 * A kick the plate has still to take (PLAN 30a-3).
 *
 * The clock decides a kick once a frame, and everything a kick does to the
 * plate (Beat Squeeze's press, Plate Rock's lean, the bloom's ring, the
 * bubbles, the bass moving on to its next area) is laid inside the step loop
 * on its first step, `simStep === 0` in LiquidVisualizer.tsx. A frame that
 * takes no step has no first step, so its kick was dropped without a word.
 * That is most frames once the plate steps slower than the display
 * refreshes: at thirty steps a second on a 120 Hz screen three frames in four
 * take none, and in the squeeze check's window on the Mac runner 16 of 41
 * kicks pressed. A projectionist's hand on the glass doesn't wait for a
 * solver step; the plate feels the press on the next step it takes. So the
 * kick is held here, with the song time and the lead it was decided at (the
 * accent asks where in the bar it fell, and the bar has moved on by the next
 * step), until a frame steps, and let go if no step comes within
 * `KICK_OWED_MS` (a stalled or paused plate, where a press laid a second late
 * is not the beat's).
 */

/*
  How long a kick waits for the plate's next step before it is let go: a
  tenth of a second, past one step's interval at the governor's floor of
  thirty steps a second (33 ms) and at the nineteen a second the Mac runner
  reached under the squeeze (53 ms), and short enough that a press laid after
  it would be the beat's ghost, not the beat. It is counted from the frame
  after the one that decided the kick, so a slow frame never drops a kick it
  steps for, and in a render, where `showNow()` is the render's own frame
  clock, a kick waits a tenth of the song's seconds.
*/
export const KICK_OWED_MS = 100;

export class PlateKick {
  owed = false;
  /** Decided this frame: never late on its own frame, whatever that frame's work took. */
  private fresh = false;
  /** The song time it was decided at, and whether the clock predicted it (the accent's lead). */
  at = 0;
  predicted = false;
  private ms = 0;
  /** Kicks the plate took on a step, and kicks let go untaken (`npm run squeeze` asks every kick is one or the other). */
  taken = 0;
  lost = 0;

  /** The clock decided a kick this frame, at song time `at` and page time `ms`. */
  decide(at: number, predicted: boolean, ms: number): void {
    // A kick still owed when the next is decided is one the plate never stepped for.
    if (this.owed) this.lost++;
    this.owed = true;
    this.fresh = true;
    this.at = at;
    this.predicted = predicted;
    this.ms = ms;
  }

  /** Whether this frame's first step lays the kick: once a frame, `steps` whether it takes any, `now` the page's clock. */
  take(steps: boolean, now: number): boolean {
    const late = this.owed && !this.fresh && now - this.ms > KICK_OWED_MS;
    this.fresh = false;
    const take = this.owed && !late && steps;
    if (take) this.taken++;
    if (late) this.lost++;
    if (take || late) this.owed = false;
    return take;
  }

  /*
    The song time of the beat this kick means, for the accent (lib/barGrid.ts).
    A *predicted* kick fires `beatLead` ms ahead of what is heard, so the beat
    it means is that far on along the readings' clock the grid keeps; a kick
    fired from a heard onset (all of them with Beat Prediction at 0, and those
    before the clock locks or after it loses the lock) fires as it is heard and
    means the beat now. Shifting those too put them 80 ms past their beat at
    the default lead: at 140 bpm 103 of 109 kicks fell off the beat and weighed
    0 at full accent, so turning Accent up in detection-only mode all but
    stopped the squeeze (measured with the real grid on the club songs).
  */
  meant(beatLead: number | undefined): number {
    return this.at + (this.predicted ? Math.max(0, beatLead ?? 0) / 1000 : 0);
  }

  reset(): void {
    this.owed = false;
    this.fresh = false;
    this.at = 0;
    this.predicted = false;
    this.taken = 0;
    this.lost = 0;
  }
}
