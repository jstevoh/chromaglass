/*
  The tools as pictograms (PLAN 35d): hand-drawn single lines on a 24 grid, one
  stroke weight, round ends, the way the pictures on a hardware key are
  printed. They replace the stock icons the phone's dock borrowed and give the
  desk's keycaps something to show beside the letter that picks the tool. Each
  draws what the tool does to the liquid, not what the tool is made of: a drop
  falling, a can spraying, a blob landing, a stream pouring, a stroke dragged,
  breath across the plate, a plunger squeezing, a finger stirring, a magnet
  under the glass, the dish going round.
*/
const PATHS: Record<string, string[]> = {
  dropper: ['M12 3.6C9.2 7.8 7.4 10.2 7.4 13.4a4.6 4.6 0 0 0 9.2 0C16.6 10.2 14.8 7.8 12 3.6Z', 'M9.8 14.2a2.4 2.4 0 0 0 1.8 2.2'],
  spray: ['M4.5 20.5v-9h7v9Z', 'M6.3 11.5V8.4h3.4v3.1', 'M9.7 9.6h2.3', 'M15 7.2h.01M17.6 5.2h.01M17.8 9.4h.01M15.2 11.8h.01M20 7.4h.01M19.6 12h.01'],
  splatter: ['M11.6 4.6c1.4.2 1.8 1.8 3.2 2.3 1.6.5 3.4.8 3.4 2.7 0 1.7-1.7 2.2-1.6 3.9.1 1.8-1.4 3-3.2 2.7-1.5-.3-2.4 1-4 .8-2-.3-2.3-2.4-3.4-3.6-.9-1-2.4-1.4-2.2-3 .2-1.7 2-1.8 3.2-2.5 1.2-.8 1.6-2.7 4.6-3.3Z', 'M19.8 4.6h.01M4.8 17.8h.01M18.4 18.4h.01'],
  pour: ['M5 8.2 10.6 4l3.6 4.8-5.6 4.2Z', 'M13.4 7.6c2.6.6 3.6 3 3.2 6.6', 'M16.6 17.4h.01M16.2 20.2h.01'],
  streak: ['M3.6 17.6c3.2-1.4 4.4-5.6 8-6.4 3-.7 4.6 1.2 8.8-3.6', 'M3.8 13.2c2.2-.6 3.2-2.8 5.2-3.4'],
  blow: ['M3.5 9h10.2a2.6 2.6 0 1 0-2.6-2.6', 'M3.5 13h14.6a2.6 2.6 0 1 1-2.6 2.6', 'M3.5 17h6.2'],
  press: ['M12 3.4v5', 'M5.2 8.8h13.6v4H5.2Z', 'M7 17.6h10', 'M9 15.2v.01M15 15.2v.01'],
  finger: ['M9.8 20.6V8.4a2.2 2.2 0 0 1 4.4 0v12.2', 'M6.6 6.2a7 7 0 0 1 10.8 0', 'M4.2 4a10 10 0 0 1 15.6 0'],
  magnet: ['M6 4.2v7.6a6 6 0 0 0 12 0V4.2h-4v7.6a2 2 0 0 1-4 0V4.2Z', 'M6 8h4M14 8h4'],
  spin: ['M19.4 12a7.4 7.4 0 1 1-2.3-5.4', 'M19.6 3.8v3.6h-3.6'],
};

export function ToolGlyph({ id, size = 20 }: { id: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" data-tool-glyph={id}>
      {(PATHS[id] ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
