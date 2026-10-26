/**
 * What the one Record button makes.
 *
 * Reported: "all the various recording options are also confusing and
 * overlapping. What's video recording? what's audio? what's recording inputs?
 * what's recording the plate?" There were three things that get recorded
 * under eight names in five places: a video file of the plate (the header's
 * Video, Canvas Video, Record the plate, Rec, Record), a replayable take of
 * the hands on the plate (Record performance, Perf, the Performance tab) and
 * a frame-exact film of a loaded song (Render this song). Audio was never a
 * recording of its own: one switch inside the video's options.
 *
 * Now there is one Record button (R, and the MIDI and remote `record-toggle`),
 * and a choice, kept here, of what pressing it starts: the Plate video, a
 * Take, or both. While anything is running the same button stops everything
 * that is running, so nobody has to remember which of two clocks to stop.
 * The default is the Plate video alone, which is what R did before; a Take
 * is opt-in, and T still starts and stops a Take by itself.
 */
export interface RecordChoice {
  /** A video file of the plate's picture, with the sound it hears when Sound is on. */
  video: boolean;
  /** The hands on the plate (strokes, drops, tool switches), replayable with the song. No file. */
  take: boolean;
}

export const DEFAULT_RECORD_CHOICE: RecordChoice = { video: true, take: false };

const KEY = 'chromaglass-record-choice';

/** Never both off: a Record button that makes nothing is not a choice anyone meant. */
export function normalizeChoice(c: Partial<RecordChoice> | null | undefined): RecordChoice {
  const video = c?.video ?? DEFAULT_RECORD_CHOICE.video;
  const take = c?.take ?? DEFAULT_RECORD_CHOICE.take;
  return video || take ? { video: !!video, take: !!take } : { ...DEFAULT_RECORD_CHOICE };
}

export function loadRecordChoice(): RecordChoice {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeChoice(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_RECORD_CHOICE };
  }
}

export function saveRecordChoice(c: RecordChoice): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private window: the choice lasts the session */ }
}

/** The words for what is chosen, in one place so the button, panel, dot and phone say the same thing. */
export function makesText(c: { video: boolean; take: boolean }): string {
  return c.video && c.take ? 'Plate video + Take' : c.take ? 'Take' : 'Plate video';
}

export interface RecordState {
  videoOn: boolean;
  takeOn: boolean;
  /** MediaRecorder and canvas capture exist here. */
  videoSupported: boolean;
}

export interface RecordMove {
  startVideo: boolean;
  startTake: boolean;
  stopVideo: boolean;
  stopTake: boolean;
}

/**
 * What one press of Record does. Anything running: stop all of it. Nothing
 * running: start what is chosen, the Take alone where this browser cannot
 * record video.
 */
export function recordMove(choice: RecordChoice, s: RecordState): RecordMove {
  if (s.videoOn || s.takeOn) return { startVideo: false, startTake: false, stopVideo: s.videoOn, stopTake: s.takeOn };
  const startVideo = choice.video && s.videoSupported;
  return { startVideo, startTake: choice.take || !startVideo, stopVideo: false, stopTake: false };
}

/** What is running, for the dot and the button while it runs. */
export function runningText(s: Pick<RecordState, 'videoOn' | 'takeOn'>): string {
  return makesText({ video: s.videoOn, take: s.takeOn });
}
