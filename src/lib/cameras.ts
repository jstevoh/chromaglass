/**
 * Which camera, for every place the app opens one.
 *
 * Two things here open a camera, and they do different jobs (PLAN 14ad):
 *
 *   - **The motion camera** (`useSceneCamera`, Settings → Motion camera) is a
 *     sensor. Its picture is read back and never shown: movement in front of
 *     it stirs the liquid, and the people it holds put hands on the plate.
 *   - **The film's Webcam** (`startFilmCamera` in LiquidVisualizer, Settings →
 *     Film) is a picture. It is drawn on the plate through the dye, the way a
 *     camera over a real dish of oil was in the light shows.
 *
 * What was reported (the owner, 2026-10-24): a camera could only be chosen for
 * the room, and only once that camera was already on and only when the browser
 * already listed more than one; the film's camera took whichever one the
 * browser called "environment", so a second webcam, a capture card or a
 * virtual camera (OBS, NDI Webcam Input, which PLAN §13 names as the way a VJ
 * app's output arrives today) could never be put on the plate at all.
 *
 * So both now go through here: one list of the cameras plugged in, one way of
 * naming them, and one way of opening the chosen one that falls back to the
 * browser's own pick when the chosen one is not plugged in, rather than
 * failing with a word like "Overconstrained" while the person at the desk is
 * looking at a camera they can see is unplugged.
 */

/** A camera as the picker offers it: its id and the name to show. */
export interface CameraChoice { id: string; label: string }

/**
 * The cameras worth offering, in the browser's order, each with a name.
 *
 * Before the page has been allowed a camera, browsers list one camera with an
 * empty id and no label (the spec's privacy rule: nothing about the devices
 * until permission). An entry with no id cannot be asked for by id, so it is
 * left out, and the picker says names appear once a camera has been allowed.
 * A camera with an id but no label (Firefox, before permission, keeps ids
 * stable) gets a number, counted among the cameras only.
 */
export function cameraChoices(devices: readonly Pick<MediaDeviceInfo, 'deviceId' | 'kind' | 'label'>[]): CameraChoice[] {
  const cams = devices.filter(d => d.kind === 'videoinput' && d.deviceId !== '');
  return cams.map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

/** True when every camera the browser listed is nameless: no permission yet. */
export function camerasUnnamed(devices: readonly Pick<MediaDeviceInfo, 'kind' | 'label'>[]): boolean {
  const cams = devices.filter(d => d.kind === 'videoinput');
  return cams.length === 0 || cams.every(d => d.label === '');
}

/**
 * Whether the chosen camera is plugged in now. The empty id is "whatever the
 * browser picks", which is there whenever any camera is.
 */
export function cameraPresent(devices: readonly Pick<MediaDeviceInfo, 'deviceId' | 'kind'>[], id: string): boolean {
  const cams = devices.filter(d => d.kind === 'videoinput');
  return id === '' ? cams.length > 0 : cams.some(d => d.deviceId === id);
}

export interface OpenedCamera {
  stream: MediaStream;
  /** The camera's own name, from its track. */
  label: string | null;
  /** The device it opened, so a later list can say which one is in use. */
  deviceId: string | null;
  /** True when a camera was chosen, was not there, and the browser's pick opened instead. */
  fellBack: boolean;
}

/**
 * Open the chosen camera, or the browser's pick when none was chosen or the
 * chosen one is not plugged in.
 *
 * `facing` is only the hint for the browser's pick: a phone's back camera for
 * the film (pointed at a dish), its front camera for the motion camera
 * (pointed at the room the phone is in). An `exact` id is the whole point of
 * a picker, so a missing camera is not quietly swapped inside one request;
 * it is a second request, and the caller is told, so the panel can say so.
 */
export async function openCamera(
  id: string,
  facing: 'user' | 'environment',
  size: { width: number; height?: number },
): Promise<OpenedCamera> {
  const dims = { width: { ideal: size.width }, ...(size.height ? { height: { ideal: size.height } } : {}) };
  const byBrowser = () => navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, ...dims }, audio: false });
  let stream: MediaStream;
  let fellBack = false;
  if (id) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id }, ...dims }, audio: false });
    } catch (err) {
      const name = (err as DOMException)?.name ?? '';
      if (name !== 'NotFoundError' && name !== 'OverconstrainedError') throw err;
      stream = await byBrowser();
      fellBack = true;
    }
  } else {
    stream = await byBrowser();
  }
  const track = stream.getVideoTracks()[0];
  return {
    stream,
    label: track?.label || null,
    deviceId: (track?.getSettings?.().deviceId as string | undefined) ?? null,
    fellBack,
  };
}

/** Words for a camera that would not open, the same in both panels. */
export function cameraError(err: unknown): string {
  const name = (err as DOMException)?.name ?? '';
  return name === 'NotAllowedError' ? 'Camera permission was refused.'
    : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'No camera is plugged in.'
    : name === 'NotReadableError' ? 'Another app is holding this camera.'
    : 'The camera would not open.';
}
