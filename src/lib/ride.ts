/**
 * A hand on a fader, between the cable and React.
 *
 * A controller sends a couple of hundred messages a second and the app keeps
 * its settings in React state, and wiring one straight to the other was wrong
 * in two ways that both showed up as the same symptom: a fader that did not
 * track.
 *
 * **The read-back was late.** Soft takeover has to compare where the fader is
 * against where the setting is, and it uses the same comparison to notice
 * somebody *else* moving the setting — a preset loading, a slider on the
 * phone — so that a fader left at 80% does not slam the value back the moment
 * it twitches. Reading that out of React state meant reading a value up to
 * several messages old, so a fader moved at any speed looked like an edit from
 * elsewhere on *every* message. It dropped its pickup and then refused to take
 * it back, because the value it was being asked to cross was the stale one it
 * had just been stranded at. Measured: of sixteen messages in a sweep, two
 * landed, and the dimmer sat at 0.53 with the fader at the top.
 *
 * **Every message was its own React update.** A MIDI callback is its own task,
 * so there is nothing for React to batch it with: two hundred renders of the
 * whole app per second to move one bar by a pixel.
 *
 * So the ride keeps its own value. Writes are answered instantly and truthfully
 * from here, and handed to React once a frame — which is as often as a number
 * can be looked at anyway.
 *
 * The part that needs care is knowing when to stop believing itself. The
 * shadow must survive a render that has not caught up yet, or the lateness is
 * straight back; and it must be given up the moment something else really did
 * move the setting, or soft takeover stops working. So each key remembers the
 * value that actually reached React, and a rendered value that disagrees with
 * *that* — never with the un-flushed shadow — is somebody else's edit.
 */

/** What the app's settings look like from here: names to numbers. */
type Live = Record<string, unknown>;

export class SettingRide {
  /** What the fader last asked for. The truth, until React catches up. */
  private shadow = new Map<string, number>();
  /** What has actually been handed to React, for spotting other people's edits. */
  private flushed = new Map<string, number>();

  /** The fader moved. */
  write(key: string, value: number): void {
    this.shadow.set(key, value);
  }

  /** Where the setting is, as the fader should understand it. */
  read(key: string, live: Live): number | undefined {
    const mine = this.shadow.get(key);
    if (mine !== undefined) return mine;
    const v = live[key];
    return typeof v === 'number' ? v : undefined;
  }

  /** Is anything waiting to be handed over? */
  get waiting(): boolean {
    for (const [k, v] of this.shadow) if (this.flushed.get(k) !== v) return true;
    return false;
  }

  /**
   * The patch to give React, or null when nothing has changed since the last
   * one. Null rather than an empty object so a caller can skip the update
   * entirely: a frame that re-renders the app to set a value to itself is the
   * cost this class exists to avoid.
   */
  drain(): Record<string, number> | null {
    let patch: Record<string, number> | null = null;
    for (const [k, v] of this.shadow) {
      if (this.flushed.get(k) === v) continue;
      this.flushed.set(k, v);
      (patch ??= {})[k] = v;
    }
    return patch;
  }

  /**
   * What React actually rendered.
   *
   * A value that differs from what was last handed over is somebody else's —
   * a preset, the sequencer, a slider — so the fader gives up its shadow and
   * has to pick the new value up. A value that merely has not arrived yet
   * differs from nothing, because it is compared against what was sent rather
   * than against what is pending.
   */
  observe(live: Live): void {
    if (this.flushed.size === 0) return;
    for (const [k, sent] of this.flushed) {
      if (live[k] === sent) continue;
      // Nothing there to have moved. A setting the app does not carry cannot
      // have been changed by a preset or a slider, so there is nothing to
      // give way to.
      if (live[k] === undefined) continue;
      this.flushed.delete(k);
      this.shadow.delete(k);
    }
  }

  /** Forget everything: a new map, a new bank, a controller unplugged. */
  reset(): void {
    this.shadow.clear();
    this.flushed.clear();
  }
}
