import { useState } from 'react';
import { Button, Sheet, Toggle } from '../ui';

/**
 * Saving a look, with the two things that make it findable later.
 *
 * A name, and — when a song is playing — whether this look belongs to that
 * song. The second is what makes the app pick it up on its own the next time
 * that track comes round, and it is a checkbox rather than a separate menu
 * because the moment you want it is the moment you are saving.
 *
 * Save makes a new preset under the name given. When one of your own saved
 * looks is open, the second button writes over that one instead, and says
 * which: the sheet is where both are, rather than Save quietly doing the
 * second whenever a look was open (see saveLook in App).
 */
export function SaveLookSheet({ suggested, songName, onSave, onClose, replaceName = null, onReplace, existingLooks = [], onReplaceExisting }: {
  suggested: string;
  /** The track playing now, if one was identified. */
  songName: string | null;
  onSave: (name: string, description: string, forSong: boolean) => void;
  onClose: () => void;
  /** The saved look that is open, which the second button writes over. Replace closes the sheet itself, and leaves it up if the look has gone. */
  replaceName?: string | null;
  onReplace?: () => void;
  /** Existing saved looks, so saving under a colliding name asks before creating a twin (PLAN 49a). */
  existingLooks?: { id: string; name: string }[];
  onReplaceExisting?: (id: string, name: string, description: string, forSong: boolean) => void;
}) {
  const [name, setName] = useState(suggested);
  const [description, setDescription] = useState('');
  const [forSong, setForSong] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  const trimmed = name.trim();
  const findCollision = (candidate: string) => {
    const key = candidate.toLowerCase();
    return existingLooks.find(l => l.name.trim().toLowerCase() === key) ?? null;
  };

  const keepBoth = () => {
    if (!trimmed) return;
    onSave(trimmed, description.trim(), forSong && !!songName);
    onClose();
  };

  const replaceExisting = () => {
    if (!trimmed || !duplicate) return;
    if (onReplaceExisting) onReplaceExisting(duplicate.id, trimmed, description.trim(), forSong && !!songName);
    else onSave(trimmed, description.trim(), forSong && !!songName);
    onClose();
  };

  const save = () => {
    if (!trimmed) return;
    const hit = findCollision(trimmed);
    if (hit && !duplicate) {
      setDuplicate(hit);
      return;
    }
    keepBoth();
  };

  return (
    <Sheet title="Save as a new palette" onClose={onClose} width={480} height={380} testId="save-sheet">
      {/* w-full: the sheet's body is a row, and without it this column took
          only its content's width, the fields 200 px wide in a 480 px sheet. */}
      <div className="flex h-full w-full flex-col gap-4 p-5">
        <label className="block">
          <span className="mb-1.5 block text-[12px] text-muted">Name</span>
          <input
            autoFocus
            // Selected, so typing a name replaces the suggestion outright.
            onFocus={e => e.currentTarget.select()}
            value={name}
            onChange={e => { setName(e.target.value); setDuplicate(null); }}
            onKeyDown={e => { if (e.key === 'Enter') save(); }}
            className="h-10 w-full rounded-md border border-border-strong bg-elevated px-3 text-[14px] text-text outline-none focus:border-accent"
            data-testid="save-name"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] text-muted">What it is for</span>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); }}
            placeholder="Slow, blue, for the quiet part"
            className="h-10 w-full rounded-md border border-border-strong bg-elevated px-3 text-[14px] text-text outline-none placeholder:text-faint focus:border-accent"
            data-testid="save-description"
          />
        </label>
        {songName && (
          <Toggle
            label={`Use it whenever “${songName}” plays`}
            on={forSong}
            onChange={setForSong}
            testId="save-for-song"
          />
        )}
        {duplicate && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200" data-testid="save-duplicate-warning">
            <span>A look named “{duplicate.name}” already exists.</span>
            <div className="flex gap-2">
              <Button height={32} onClick={keepBoth} testId="save-keep-both">Keep both</Button>
              <Button height={32} variant="primary" onClick={replaceExisting} testId="save-replace-existing">Replace</Button>
            </div>
          </div>
        )}
        <div className="mt-auto flex items-center justify-end gap-2">
          {replaceName && onReplace && (
            <Button height={40} onClick={onReplace} testId="save-replace" title={`Save changes to “${replaceName}”`}>
              <span className="max-w-[180px] truncate">Save “{replaceName}”</span>
            </Button>
          )}
          <span className="flex-1" />
          <Button height={40} onClick={onClose} testId="save-cancel">Cancel</Button>
          <Button height={40} variant="primary" onClick={save} testId="save-confirm">Save As...</Button>
        </div>
      </div>
    </Sheet>
  );
}
