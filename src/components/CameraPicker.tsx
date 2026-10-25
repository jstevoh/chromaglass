import { cameraChoices, camerasUnnamed } from '../lib/cameras';

/**
 * Which camera, the same control wherever a camera is used (PLAN 14ad).
 *
 * It was a select in the room's section only, drawn only once that camera was
 * already running and only when the browser listed two, so the one moment a
 * person wants to choose (before the light comes on) was the moment it was not
 * there, and the film's camera had no picker at all. Now it is always drawn:
 *
 *   - "Default camera" is the browser's pick, as it always was.
 *   - A remembered camera that is not plugged in stays chosen and says so,
 *     rather than vanishing from the list and leaving the select reading a
 *     camera that is not the one in use. Plugged back in, it is used again.
 *   - Before the page has been allowed any camera, browsers keep the names
 *     back; the line under it says that rather than offering an empty list.
 */
export function CameraPicker({ cameras, value, onChange, label, testId, inUse, fellBack }: {
  cameras: readonly MediaDeviceInfo[];
  value: string;
  onChange: (id: string) => void;
  /** What the select is for, read by a screen reader and shown as its label. */
  label: string;
  testId: string;
  /** The camera's own name while it is open, from its track. */
  inUse?: string | null;
  /** The chosen camera was missing, so the browser's pick is the one open. */
  fellBack?: boolean;
}) {
  const choices = cameraChoices(cameras);
  const missing = value !== '' && !choices.some(c => c.id === value);
  const unnamed = camerasUnnamed(cameras);
  return (
    <div className="mb-3" data-testid={`${testId}-row`}>
      <label className="flex items-center justify-between gap-2 text-[12px] text-text-2">
        <span className="shrink-0">{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          data-testid={testId}
          className="min-h-[32px] min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[12px] text-text outline-none"
        >
          <option value="">Default camera</option>
          {choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          {missing && <option value={value}>Chosen camera (not plugged in)</option>}
        </select>
      </label>
      {(fellBack || missing) ? (
        <p className="mt-1 text-[12px] leading-relaxed text-amber-300/80" data-testid={`${testId}-note`}>
          The chosen camera is not plugged in{inUse ? `, so this is ${inUse}` : ''}. It is used again as soon as it is.
        </p>
      ) : unnamed ? (
        <p className="mt-1 text-[12px] leading-relaxed opacity-40" data-testid={`${testId}-note`}>
          The browser names its cameras once one has been switched on here.
        </p>
      ) : null}
    </div>
  );
}
