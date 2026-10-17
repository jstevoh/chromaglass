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
 * from here. The plate reads them here on every frame (`lay`), and React, whose
 * only job left is the number on the desk, is handed them ten times a second.
 * Once a frame was the first answer, and it still rendered the whole app sixty
 * times a second while a fader moved (PLAN.md §14f).
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

/**
 * One reader's last answer from `lay`, so a frame whose base and ride have not
 * changed is handed the same object again rather than a new copy.
 */
export interface RideSlot { base: Live | null; version: number; out: Live | null }
export const rideSlot = (): RideSlot => ({ base: null, version: -1, out: null });

export class SettingRide {
  /** What the fader last asked for. The truth, until React catches up. */
  private shadow = new Map<string, number>();
  /** What has actually been handed to React, for spotting other people's edits. */
  private flushed = new Map<string, number>();
  /** Bumped whenever the shadow changes, for `lay`'s reuse. */
  private version = 0;

  /** The fader moved. */
  write(key: string, value: number): void {
    if (this.shadow.get(key) === value) return;
    this.shadow.set(key, value);
    this.version++;
  }

  /** Is this setting under a fader the app has not finished hearing from? */
  holds(key: string): boolean {
    return this.shadow.has(key);
  }

  /**
   * What a frame should draw: `base` with every ridden value it has not yet
   * caught up with laid over it (PLAN.md §14f).
   *
   * React is told about a ride ten times a second, so a plate that drew only
   * what React rendered would move in tenth-of-a-second steps under a fader.
   * The plate asks here instead, at the top of every frame. #348 tried the
   * same split and took it back for three faults, and each is answered here:
   *
   * - **It never stopped.** The shadow outlives the flush by design (soft
   *   takeover reads it), so laying the whole shadow over every frame copied
   *   the settings sixty times a second forever after one touch. A key is laid
   *   only while `base` still disagrees with it, and once React has rendered
   *   every ridden value this returns `base` itself: no copy, no allocation.
   * - **It sat over the identified track's overrides.** The fader writes the
   *   look's setting, and a track that overrides the same key wins in what is
   *   drawn (App's `effectiveSettings`); a ride laid over the drawn settings
   *   undid that for good. `keep` is the caller's say over which keys this
   *   reader may take, and App leaves out what the overrides hold.
   * - **Half the loop still read the old object.** The frame loop reads its
   *   settings in more places than the fold; the caller puts what this
   *   returns where all of them read, once, at the top of the frame.
   *
   * The copy, when there is one, is made once per change of the ride or of
   * `base` (kept in `slot`), not once per frame: a new object only when a
   * value in it is new, which is also what anything comparing settings by
   * identity expects.
   */
  lay(base: Live, keep: (key: string) => boolean, slot: RideSlot): Live {
    let behind = false;
    for (const [k, v] of this.shadow) {
      if (base[k] !== v && keep(k)) { behind = true; break; }
    }
    if (!behind) return base;
    if (slot.out && slot.base === base && slot.version === this.version) return slot.out;
    const out: Live = { ...base };
    for (const [k, v] of this.shadow) if (keep(k)) out[k] = v;
    slot.base = base;
    slot.version = this.version;
    slot.out = out;
    return out;
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
      this.version++;
    }
  }

  /** Forget everything: a new map, a new bank, a controller unplugged. */
  reset(): void {
    this.shadow.clear();
    this.flushed.clear();
    this.version++;
  }
}
