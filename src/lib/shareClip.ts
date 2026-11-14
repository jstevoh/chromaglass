/**
 * Hand a recorded clip to the device's own share sheet (PLAN 34f).
 *
 * The phone's Play screen did this inline (`PhonePlay.tsx`, "Share clip"); it
 * is here so the desk's Record panel and the phone's More sheet send a clip
 * the same way. A share sheet opened after an await of anything else is
 * refused for want of a user gesture, so `shareClip` is called straight from
 * the tap and awaits nothing before `navigator.share`.
 */

export interface ShareableClip { blob: Blob; filename: string; url: string }

type ShareNav = Navigator & { canShare?: (d: { files: File[] }) => boolean };

function fileOf(clip: ShareableClip): File {
  return new File([clip.blob], clip.filename, { type: clip.blob.type || 'video/mp4' });
}

/** Whether this browser can send the clip as a file (Messages, Instagram, Photos). */
export function canShareClip(clip: ShareableClip): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as ShareNav;
  try { return !!nav.share && !!nav.canShare?.({ files: [fileOf(clip)] }); } catch { return false; }
}

/** The share sheet where there is one; a download where there is not. */
export async function shareClip(clip: ShareableClip): Promise<void> {
  const nav = navigator as ShareNav;
  if (canShareClip(clip)) {
    try { await nav.share({ files: [fileOf(clip)], title: 'ChromaGlass' }); } catch { /* closed without sharing */ }
    return;
  }
  const a = document.createElement('a');
  a.href = clip.url; a.download = clip.filename; a.click();
}
