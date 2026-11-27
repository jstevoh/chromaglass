import { useState } from 'react';
import { Toggle } from '../ui';

export interface ExistingLook {
  id: string;
  name: string;
}

export interface PhoneSaveFormProps {
  /** Initial name shown in the field (typically a non-colliding suggestion). */
  value: string;
  onValueChange: (v: string) => void;
  /** Currently open user look, when saving can overwrite it directly. */
  replaceName?: string | null;
  onReplace?: () => void;
  /** Identified track playing now, so the saved look can bind to it. */
  songName?: string | null;
  /** User-saved looks checked for duplicate-name collisions. */
  existingLooks?: ExistingLook[];
  onReplaceExisting?: (id: string) => void;
  onSave: (name: string, description: string, forSong: boolean) => void;
  onDone: () => void;
  /** Test id prefix: 'phone' (PhoneStage) or 'play' (PhonePlay). */
  prefix: 'phone' | 'play';
  ariaLabel: string;
  /** Glass styling for PhonePlay over the live plate; solid surface styling for PhoneStage. */
  glass?: boolean;
}

/**
 * Shared mobile save form matching Desktop's SaveLookSheet (PLAN 49h, H4-16).
 *
 * Lets a phone performer overwrite the currently open user look, add an optional
 * note, bind the look to the playing song, and confirm before duplicating an
 * existing saved look name.
 */
export function PhoneSaveForm({
  value,
  onValueChange,
  replaceName = null,
  onReplace,
  songName = null,
  existingLooks = [],
  onReplaceExisting,
  onSave,
  onDone,
  prefix,
  ariaLabel,
  glass = false,
}: PhoneSaveFormProps) {
  const [description, setDescription] = useState('');
  const [forSong, setForSong] = useState(false);
  const [dup, setDup] = useState<ExistingLook | null>(null);

  const commitSave = (name: string) => {
    onSave(name, description.trim(), forSong && !!songName);
    setDup(null);
    onDone();
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const match = existingLooks.find(l => l.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (match) {
      setDup(match);
      return;
    }
    commitSave(trimmed);
  };

  const inputCls = glass
    ? 'min-w-0 flex-1 rounded-[14px] border border-white/10 bg-white/[0.06] px-3 text-[16px] text-text outline-none placeholder:text-white/40 focus:border-accent'
    : 'min-w-0 flex-1 rounded-lg border border-border-strong bg-elevated px-3 text-[16px] text-text outline-none placeholder:text-faint focus:border-accent';
  const overwriteCls = glass
    ? 'border-white/15 bg-white/[0.08] text-text active:bg-white/15'
    : 'border-border-strong bg-elevated text-text active:bg-active';
  const confirmCls = glass
    ? 'rounded-[14px] bg-primary text-on-primary'
    : 'rounded-lg bg-text text-bg';

  return (
    <div className="flex flex-col gap-2" data-testid={`${prefix}-save-panel`}>
      {replaceName && onReplace && (
        <button
          type="button"
          onClick={() => { onReplace(); onDone(); }}
          data-testid={`${prefix}-save-overwrite`}
          className={`flex h-11 w-full items-center justify-center rounded-lg border px-3 text-[14px] font-medium transition-colors ${overwriteCls}`}
        >
          <span className="truncate">Save “{replaceName}”</span>
        </button>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
        data-testid={`${prefix}-save-form`}
      >
        <input
          autoFocus
          onFocus={e => e.currentTarget.select()}
          value={value}
          onChange={e => { onValueChange(e.target.value); setDup(null); }}
          aria-label={ariaLabel}
          // 16 px: under it, iOS zooms the page in on focus.
          className={`h-12 ${inputCls}`}
          data-testid={`${prefix}-save-name`}
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className={`h-12 shrink-0 px-4 text-[14px] font-medium disabled:opacity-40 ${confirmCls}`}
          data-testid={`${prefix}-save-confirm`}
        >
          Save
        </button>
      </form>
      <input
        type="text"
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="What it is for (optional)"
        aria-label="What it is for"
        className={`h-11 ${inputCls}`}
        data-testid={`${prefix}-save-description`}
      />
      {songName && (
        <Toggle
          label={`Use it whenever “${songName}” plays`}
          on={forSong}
          onChange={setForSong}
          testId={`${prefix}-save-for-song`}
        />
      )}
      {dup && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200"
          data-testid={`${prefix}-save-duplicate`}
        >
          <span>“{dup.name}” already exists.</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => commitSave(value.trim())}
              className="h-11 rounded-lg border border-border bg-elevated px-3 text-[13px] font-medium text-text"
              data-testid={`${prefix}-save-keep-both`}
            >
              Keep both
            </button>
            {onReplaceExisting && (
              <button
                type="button"
                onClick={() => { onReplaceExisting(dup.id); setDup(null); onDone(); }}
                className="h-11 rounded-lg bg-primary px-3 text-[13px] font-medium text-on-primary"
                data-testid={`${prefix}-save-replace`}
              >
                Replace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
