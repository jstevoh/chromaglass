/**
 * The copies of the wall's canvas that are made inside the frame task.
 *
 * A presented WebGPU canvas read outside the task that drew it answers
 * black, not an error, so whatever wants the wall's picture on its own clock
 * takes a copy here, as the frame task draws it: the remote's Draw, a small
 * copy while a pad is asking (lib/padPicture.ts), and the Live Show, its
 * staging canvases while it is on air (lib/liveFrame.ts, 37x-4d-6, where a
 * stream read on its own clock was black on SwiftShader and on Metal). One
 * call from the frame loop, so a new copy is a line here and not in
 * LiquidVisualizer (19ai-10). Each tap is cheap when nobody is asking.
 */
import { tapPadPicture } from './padPicture';
import { tapLiveFrame } from './liveFrame';

export function tapFrameCopies(canvas: HTMLCanvasElement): void {
  tapPadPicture(canvas);
  tapLiveFrame('plate', canvas);
}
