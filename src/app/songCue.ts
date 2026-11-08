/**
 * Where a song action from the owner's assistant lands (PLAN 44f).
 *
 * The assistant answers in one to ten seconds, so it cannot hit a beat. What
 * it can do is program one: "blue on the next drop" goes into the show of the
 * song playing now, and the show's own scheduler (lib/songShows.ts
 * `dueActions`) fires it on the frame the drop begins, on the song's clock.
 * So the relay's `song-action` is added the way a cue pinned on the score is
 * (`pinScoreCue` in app/useSongScore.ts): to the song's show, or a new show
 * for the song, for the performer to see in the Songs panel and take out.
 *
 * Why a holder here rather than a prop. The message arrives in useRemote and
 * the song shows are useSongScore's, and both are called from App(), which is
 * over its size ceiling and may not grow (`npm run sizes`): one more ref
 * passed between them is bytes App.tsx cannot take. lib/padPicture.ts holds
 * its sender for the same kind of reason. The state stays App's: this holds
 * only the function that writes it, set while useSongScore is mounted.
 */
import type { ActionWhat, ActionWhen } from '../lib/songShows';

/** Adds the action to the song playing now; says why not, or null when it did. */
export type SongCueSink = (when: ActionWhen, what: ActionWhat) => string | null;

let sink: SongCueSink | null = null;
export function setSongCueSink(s: SongCueSink | null): void { sink = s; }
/** The relay's `song-action`, already parsed: added, or the reason it was not. */
export function addSongCue(when: ActionWhen, what: ActionWhat): string | null {
  return sink ? sink(when, what) : 'the song shows are not running';
}
