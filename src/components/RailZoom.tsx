import { travelOfKey, valueOfKey } from '../lib/deskPins';

/**
 * The Macro Zoom on the side rail, where the rail's Macro button was.
 *
 * The rail had a Macro button that flipped the closeup's flag on and off. The
 * owner asked for the Close-up buttons to go and for the zoom to be the one
 * way in and out (PLAN QA-32c), so the rail keeps a place to come in close,
 * and that place is the zoom itself: the same Macro Zoom the desk, the phone
 * and the remote draw, on the same curved throw (`travelOfKey`, the desk's
 * curve 2, so the first half of the travel is the gentle 1x to 4x where most
 * closeups live), written through the app's `onZoom`, which carries the
 * look's flag beside the zoom so a saved look still files under Closeup.
 *
 * It is its own file because App.tsx is past the size line and may not grow.
 */
export function RailZoom({ zoom, onZoom }: { zoom: number; onZoom: (zoom: number) => void }) {
  const at = travelOfKey('macroZoom', Math.max(1, zoom));
  return (
    <div className="flex flex-col gap-1 w-full" data-testid="rail-zoom">
      <div className="flex items-center justify-between w-full">
        <span className="text-[11px] uppercase tracking-widest font-bold text-white/55">Zoom</span>
        <span className="text-[8px] font-bold text-white/50">{Math.max(1, zoom).toFixed(1)}×</span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.001"
        value={at}
        onChange={e => onZoom(valueOfKey('macroZoom', +e.target.value))}
        className="w-full h-6 appearance-none rounded-full cursor-pointer accent-purple-400"
        style={{ background: `linear-gradient(to right, rgb(192,132,252) ${at * 100}%, rgba(255,255,255,0.1) ${at * 100}%)` }}
        title="Macro Zoom — come in close on the plate, and all the way left is the whole plate again"
        aria-label="Macro Zoom"
        data-testid="rail-zoom-slider"
      />
    </div>
  );
}
