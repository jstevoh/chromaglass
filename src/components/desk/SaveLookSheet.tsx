import { useState } from 'react';
import { Button, Sheet, Toggle } from '../ui';

/**
 * Saving a look, with the two things that make it findable later.
 *
 * A name, and — when a song is playing — whether this look belongs to that
 * song. The second is what makes the app pick it up on its own the next time
 * that track comes round, and it is a checkbox rather than a separate menu
 * because the moment you want it is the moment you are saving.
 */
export function SaveLookSheet({ suggested, songName, onSave, onClose }: {
  suggested: string;
  /** The track playing now, if one was identified. */
  songName: string | null;
  onSave: (name: string, description: string, forSong: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(suggested);
  const [description, setDescription] = useState('');
  const [forSong, setForSong] = useState(false);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, description.trim(), forSong && !!songName);
    onClose();
  };

  return (
    <Sheet title="Save this look" onClose={onClose} width={480} height={360} testId="save-sheet">
      <div className="flex h-full flex-col gap-4 p-5">
        <label className="block">
          <span className="mb-1.5 block text-[12px] text-muted">Name</span>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
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
        <div className="mt-auto flex justify-end gap-2">
          <Button height={40} onClick={onClose} testId="save-cancel">Cancel</Button>
          <Button height={40} variant="primary" onClick={save} testId="save-confirm">Save</Button>
        </div>
      </div>
    </Sheet>
  );
}
