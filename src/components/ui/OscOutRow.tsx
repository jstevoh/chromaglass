/*
  OSC out's switch and where it sends (PLAN.md 13.5-osc), one row for Settings
  on the desk and for the phone layout, which take it at their own sizes
  (`touch`), as the tap pad is shared. Shown only while a show server is there
  to send the UDP (`oscOut` non-null): the website alone cannot.

  The target is typed, "address:port", because a VJ app is found by address:
  Resolume on this Mac is the default (127.0.0.1:7000), another machine its
  Wi-Fi address, every machine on the network its broadcast one. A target the
  rule refuses (`oscOutTarget`) is said beside the field and nothing changes.
*/
import { useEffect, useState } from 'react';
import { LIT } from './index';
import { oscOutLine, type OscOutLabel } from '../../lib/oscOut';

export function OscOutRow({ oscOut, onOscOut, touch = false, testId = 'osc-out' }: {
  oscOut: OscOutLabel;
  onOscOut: (on: boolean, target?: string) => boolean;
  touch?: boolean;
  testId?: string;
}) {
  const [draft, setDraft] = useState(oscOut.target);
  const [refused, setRefused] = useState(false);
  useEffect(() => { setDraft(oscOut.target); }, [oscOut.target]);
  const commit = () => {
    if (draft.trim() === oscOut.target) { setRefused(false); return; }
    setRefused(!onOscOut(oscOut.on, draft));
  };
  const size = touch ? 'min-h-11 rounded-xl px-4 text-[14px]' : 'min-h-9 rounded-lg px-3 text-[13px]';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onOscOut(!oscOut.on)}
          aria-pressed={oscOut.on}
          data-testid={testId}
          title="Send the plate's colour, the sound's levels and the beat to Resolume, VDMX, TouchDesigner or any app that takes OSC"
          className={`${size} flex-none border font-medium transition-all ${oscOut.on ? LIT : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
        >
          OSC out
        </button>
        <input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setRefused(false); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label="OSC out goes to (address:port)"
          aria-invalid={refused}
          inputMode="decimal"
          spellCheck={false}
          data-testid={`${testId}-target`}
          className={`${touch ? 'h-11 rounded-xl text-[14px]' : 'h-9 rounded-lg text-[12px]'} w-40 border bg-white/5 px-3 font-mono outline-none focus:border-accent-border ${refused ? 'border-red-400/60' : 'border-white/10'}`}
        />
      </div>
      <span className="text-[12px] leading-snug opacity-50" data-testid={`${testId}-says`}>
        {refused ? 'Not an address:port. Type it like 192.168.1.20:7000.' : oscOutLine(oscOut)}
      </span>
    </div>
  );
}
