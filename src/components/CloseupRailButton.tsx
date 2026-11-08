import { Microscope } from 'lucide-react';
import { LIT } from './ui';
import type { VisualizerSettings } from '../types';
import { closeupToggle, macroZoomOf } from '../sim/constants';

/**
 * The side rail's Macro button: the same press as the desk's Close-up, M and
 * the phone's switch (`closeupToggle`, PLAN QA-32), in by the zoom to 4x and
 * out with both, and lit by the zoom the frame is drawn at.
 *
 * It flipped `macroMode` alone until 2026-11-07, so a press put the plate at
 * 4x under a Macro Zoom that read 1.0x, and a zoom set by the slider left the
 * button dark. It lives here rather than in App.tsx because App is held at
 * its size ceiling (`npm run sizes`), and a lit state written as one name
 * (`on`) is what `npm run states` reads.
 */
export function CloseupRailButton({ settings, onSetting }: {
  settings: VisualizerSettings; onSetting: (patch: Partial<VisualizerSettings>) => void;
}) {
  const on = macroZoomOf(settings) > 1.05;
  return (
    <button
      aria-pressed={on}
      onClick={() => onSetting(closeupToggle(settings))}
      className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
        on ? LIT : 'bg-white/5 hover:bg-white/10 border-white/10'
      }`}
      title="Macro closeup — magnify the plate and chase a single bead of liquid"
    >
      <Microscope size={16} className={on ? '' : 'opacity-60 group-hover:opacity-100'} />
      <span className="text-[7px] font-bold uppercase tracking-widest">Macro</span>
    </button>
  );
}
