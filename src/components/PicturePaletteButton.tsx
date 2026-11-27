import { useRef, useState, type ReactNode } from 'react';

/**
 * "Palette from a picture or video": a button over a hidden file picker
 * (PLAN 43d). The desk's Dyes panel and the phone's Dye sheet each draw one in
 * their own style and hand the file to the same call (usePaletteLock's
 * `paletteFromFile`), so the phone shares rather than forks. The picker takes
 * pictures and videos, which is every album cover, photo, still or clip a
 * person has to hand. While a video is read (eight frames across it, about a
 * second) the button says so and does not take a second file.
 */
export function PicturePaletteButton({ onFile, className, testId, children }: {
  onFile: (file: File) => Promise<unknown>;
  className: string;
  testId: string;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        data-testid={`${testId}-input`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setReading(true);
          void onFile(file).finally(() => setReading(false));
        }}
      />
      <button
        type="button"
        disabled={reading}
        onClick={() => input.current?.click()}
        className={className}
        data-testid={testId}
        title="Take the four main colours of an album cover, a photo or a video as the palette. Only the dye colours change; the liquids move as before."
      >
        {reading ? 'Reading the colours…' : children}
      </button>
    </>
  );
}
