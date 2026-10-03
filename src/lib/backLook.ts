/**
 * The back plate's own look (PLAN.md §16a, the first step of many plates).
 *
 * A light show was several projectors, each its own source (docs/rig-plan.md
 * R1): the operator on the back projector changed their dish without asking
 * the one on the front. Here the back plate was the front's twin. Both plates
 * stepped with one look, and the only differences were ones the look itself
 * wrote in (Background Loop slowing it, Layer Scale Variety throwing it, the
 * spin turned the other way). A Go changed both at once, and nothing could
 * change one.
 *
 * What a plate's own look is: how that plate's liquid *moves*, which is every
 * setting the solver reads (`PER_LAYER`, which `npm run panel` holds to the
 * solver's own source), and what the plate *pours*, its dyes, pour style and
 * liquids. Those live in the visualizer, next to the front's. What is not the
 * plate's own is how the plates are drawn and lit: the lacing, the lamp, the
 * glass, the blend. One render pass draws both plates into one picture, and a
 * second picture is 16b's (a projector picks its source). Until then a look
 * sent to the back brings its liquid and its colours, and the front's picture
 * shows them.
 *
 * This file is the fade and nothing else, so `npm run backplate` can drive it
 * with a made-up clock. A Go to the back plate fades the back plate's solver
 * settings over the fade time, the same curve as a Go on the front
 * (`blendLooks`). A second Go before the first has landed starts from where
 * the back plate is, not from where the first Go started. "Follow the front"
 * fades back to the front's live settings, and once it has landed the back
 * plate is the front's twin again with nothing left of its own.
 */

import type { VisualizerSettings } from '../types';
import { blendLooks } from './lookFade';

/** Where the back plate is going: a look of its own, or back to the front's. */
type Target = { look: VisualizerSettings } | 'front';

export class BackLook {
  private from: VisualizerSettings | null = null;
  private to: Target | null = null;
  private start = 0;
  private ms = 0;
  /** The look's id and name, for the Mixer's back row and the desk; null while following the front. */
  id: string | null = null;
  name: string | null = null;

  /**
   * Send the back plate a look, or `null` to follow the front again.
   *
   * `front` is what the front plate is stepping with now. It is where a back
   * plate that has no look of its own starts from, and where one following the
   * front ends up.
   */
  send(look: VisualizerSettings | null, front: VisualizerSettings, now: number, seconds: number, id: string | null = null, name: string | null = null): void {
    // From where the back plate is this frame, so a Go in the middle of a
    // fade does not jump back to the fade's start. A copy, because a landed
    // look hands back the look object itself and that object is the caller's.
    const here = this.base(front, now);
    this.from = { ...(here ?? front) };
    if (look === null && here === null) {
      // Already the front's twin: nothing to fade.
      this.from = null; this.to = null; this.id = null; this.name = null;
      return;
    }
    this.to = look === null ? 'front' : { look };
    this.start = now;
    this.ms = Math.max(0, seconds) * 1000;
    this.id = look === null ? null : id;
    this.name = look === null ? null : name;
  }

  /** True while the back plate has a look of its own or is fading back to the front's. */
  get active(): boolean { return this.to !== null; }

  /**
   * The back plate's own solver settings at `now`, or null when it follows
   * the front. A whole settings object, of which the patch bay reads only the
   * `PER_LAYER` keys.
   *
   * Once landed on a look it is that look's object, the same one every frame,
   * so a show that sets the back plate once and plays for an hour allocates
   * nothing for it. Only a fade makes a new object, one a frame for the fade's
   * length, the same as a Go on the front does.
   */
  base(front: VisualizerSettings, now: number): VisualizerSettings | null {
    const to = this.to;
    if (!to || !this.from) return null;
    const target = to === 'front' ? front : to.look;
    const t = this.ms <= 0 ? 1 : (now - this.start) / this.ms;
    if (t >= 1) {
      if (to === 'front') { this.to = null; this.from = null; return null; }
      return target;
    }
    return blendLooks(this.from, target, Math.max(0, t));
  }

  /** Forget the back plate's look at once, with no fade (a render beginning or ending). */
  clear(): void { this.from = null; this.to = null; this.id = null; this.name = null; }
}
