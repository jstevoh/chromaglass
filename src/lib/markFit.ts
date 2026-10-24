/*
  The mark (a logo or title card), made small enough to cross the show server
  (PLAN 14m-mark).

  What broke: 14m made the relay close any socket that sends a frame over
  MAX_FRAME_BYTES (512 KB, code 1009) rather than hold a stranger's megabytes,
  and the laptop's link drops a message that large rather than lose its socket.
  The mark crosses the relay as a data URL, once, when a network display joins;
  a photographed logo or a PNG title card exported at print size is easily a
  few megabytes, so after 14m the network display simply showed no logo where
  it used to.

  The fix is to send the network display a copy that fits, not to raise the
  cap: the cap is what keeps the relay from holding anyone's megabytes, and a
  wall needs no more pixels than the wall has. A mark that already fits goes
  as it is, byte for byte, so every logo that crossed before still crosses
  unchanged. A larger one is redrawn no wider than MARK_CAST_SIDE on its long
  side and encoded as WebP (which keeps the logo's transparency; JPEG would
  paint the clear parts black on the wall), then halved again in steps until it
  fits. Safari encodes no WebP from a canvas and hands back a PNG instead
  (`toDataURL` falls back to PNG for a type it cannot write), so there the steps
  are PNGs, which also keep transparency, only smaller sooner.

  The laptop's own plate and a cast window on the same machine keep the
  original: neither crosses the relay, and the plate is drawn from the file.
*/

/** The most a mark may be, as a data URL, to cross the relay with room to spare under MAX_FRAME_BYTES. */
export const MARK_CAST_CHARS = 400_000;
/** The long side a mark is first redrawn at: a 1080p wall's width, more than any wall's logo needs. */
export const MARK_CAST_SIDE = 1920;

/**
 * The mark as the relay can carry it: `dataUrl` itself when it fits in
 * `maxChars`, else a redrawn copy that does. `img` is the decoded mark (its
 * natural size is what is scaled). Returns null only when no canvas can be
 * made, which leaves the network display without a mark, as before.
 */
export function fitMarkForCast(img: HTMLImageElement, dataUrl: string, maxChars = MARK_CAST_CHARS): string | null {
  if (dataUrl.length <= maxChars) return dataUrl;
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let scale = Math.min(1, MARK_CAST_SIDE / Math.max(w0, h0));
  // Each step is 0.7 of the last on a side, about half the pixels; twelve
  // steps reach a few pixels from any size, so the loop always ends.
  for (let step = 0; step < 12; step++) {
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const url = canvas.toDataURL('image/webp', 0.9);
    if (url.length <= maxChars) return url;
    scale *= 0.7;
  }
  return null;
}
