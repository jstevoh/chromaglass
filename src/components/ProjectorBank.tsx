import type { ReactNode } from 'react';
import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types';
import { Slider, LIT } from './ui';
import { PIN_RANGE } from '../lib/deskPins';
import { readSetting } from '../lib/readout';

/**
 * The projector bank, drawn (PLAN 51a, lib/projectorBank.ts): each
 * projector's lamp and shutter, and the A/B crossfade, at the top of the
 * Mixer, so it is on the desk's Mixer sheet, Settings → Live → Mixer, the
 * phone's Mix sheet and the remote at once (MixerPanel's one-component rule).
 *
 * The lamp is a slider, the variac's knob; the shutter is a button, because
 * a vane is swung in or out (the frame walks it there in 80 ms), and a fader
 * learned to it on a controller holds it part way. B and the crossfade are
 * drawn only when there is a B: Two Projectors on, with a back plate. A row
 * that would do nothing is worse than none (a control that lies).
 */
export interface ProjectorBankProps {
  settings: VisualizerSettings;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
  touch?: boolean;
  chips?: (key: keyof VisualizerSettings) => ReactNode;
  testId?: string;
}

type BankKey = 'projLampA' | 'projLampB' | 'projShutterA' | 'projShutterB' | 'projCross';

const valueOf = (s: VisualizerSettings, k: BankKey): number => {
  const v = s[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_SETTINGS[k] as number;
};

export function ProjectorBank({ settings, onSetting, touch = false, chips, testId = 'bank' }: ProjectorBankProps) {
  const two = (settings.twoProjectors ?? 0) > 0.5 && Math.round(settings.layerCount ?? 1) > 1;
  const slider = (k: BankKey, label: string) => {
    const spec = PIN_RANGE.get(k) ?? { min: 0, max: 1 };
    const v = valueOf(settings, k);
    return (
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <div className="min-w-0 flex-1">
          <Slider label={label} value={v} min={spec.min} max={spec.max} step={0.01}
            display={readSetting(k, v, spec.min, spec.max)}
            onChange={n => onSetting({ [k]: n })}
            midiKey={`setting:${k}`} touch={touch} testId={`${testId}-${k}`} resetTo={DEFAULT_SETTINGS[k] as number} />
        </div>
        {chips && <div className="pt-0.5">{chips(k)}</div>}
      </div>
    );
  };
  const shutter = (k: 'projShutterA' | 'projShutterB', name: string) => {
    const shut = valueOf(settings, k) > 0.5;
    return (
      <button type="button" aria-pressed={shut} onClick={() => onSetting({ [k]: shut ? 0 : 1 })}
        title={`${name}'s shutter: a vane over the lens, ${shut ? 'shut; press to open' : 'open; press to shut'}`}
        data-testid={`${testId}-${k}`}
        className={`mt-4 shrink-0 rounded-md border px-2 text-[12px] font-medium transition-colors ${touch ? 'h-12 min-w-[64px]' : 'h-7 min-w-[52px]'} ${
          shut ? LIT : 'border-border text-text-2 hover:bg-hover'
        }`}>
        {shut ? 'Shut' : 'Open'}
      </button>
    );
  };
  return (
    <div className="rounded-lg border border-border px-2 pb-1 pt-1" data-testid={testId} data-two={two ? '1' : '0'}>
      <div className={`${touch ? 'text-[14px]' : 'text-[13px]'} font-medium text-text`}>Projectors</div>
      <div className="flex items-start gap-2">{slider('projLampA', two ? 'Lamp A' : 'Lamp')}{shutter('projShutterA', two ? 'Projector A' : 'The projector')}</div>
      {two ? (
        <>
          <div className="flex items-start gap-2">{slider('projLampB', 'Lamp B')}{shutter('projShutterB', 'Projector B')}</div>
          {slider('projCross', 'A/B Crossfade')}
        </>
      ) : (
        <p className={`${touch ? 'text-[13px]' : 'text-[12px]'} pb-1 leading-snug text-muted`}>
          A second projector, its own lamp and an A/B crossfade come with Two Projectors and a back plate.
        </p>
      )}
    </div>
  );
}
