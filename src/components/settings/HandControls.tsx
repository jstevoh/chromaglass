import React from 'react';
import type { CordMaster, SceneMapping, VisualizerSettings } from '../../types';
import { CORD_MASTERS, HAND_VOLUME_MAX, isAreaTarget, reachOf } from '../../lib/areaCords';
import { LIT } from '../ui';

/*
  How a hand acts, on its cord's row in the patch bay (PLAN 38v-1,
  lib/areaCords.ts): its reach (Size), where it roams (Roam), and on a pour
  whether it is a dropper (Volume, in drops' worth) and how many drops a gated
  slug splits into (Drops). And, on any cord, the dials it rides as masters:
  the music's own cords ride Sound Drive, the kick's bloom Kick Bloom too, and
  pressing a chip puts any cord under that knob or takes it off.

  A file beside PatchesSection.tsx because that one is near its size line;
  the row hands each cord here and this draws only what that cord can take.
*/
type Props = {
  m: SceneMapping;
  i: number;
  settings: VisualizerSettings;
  onUpdate: (patch: Partial<VisualizerSettings>) => void;
};

export function HandControls({ m, i, settings, onUpdate }: Props) {
  const put = (patch: Partial<SceneMapping>) => {
    const next = [...(settings.sceneMappings ?? [])];
    next[i] = { ...m, ...patch };
    onUpdate({ sceneMappings: next });
  };
  const hand = isAreaTarget(m.setting);
  const pour = m.setting === 'areaPour';
  const gatedPour = pour && (m.mode === 'gate' || (m.mode !== 'follow' && (m.threshold !== undefined || m.attack !== undefined || m.release !== undefined)));
  const rows: [keyof SceneMapping, string, number, number, number, number, (v: number) => string][] = [];
  if (hand && m.setting !== 'areaHue') {
    rows.push(['size', 'Size', 0.02, 1, 0.01, reachOf(m), v => `${Math.round(v * 100)}%`]);
    rows.push(['wander', 'Roam', 0, 1, 0.05, m.wander ?? 0, v => `${Math.round(v * 100)}%`]);
  }
  if (pour) {
    rows.push(['volume', 'Volume', 0, HAND_VOLUME_MAX, 0.1, m.volume ?? 0, v => (v > 0 ? `${v.toFixed(1)} dr` : 'wash')]);
    if (gatedPour && (m.volume ?? 0) > 0) rows.push(['drops', 'Drops', 1, 16, 1, m.drops ?? 1, v => `${Math.round(v)}`]);
  }
  const has = (k: CordMaster) => (m.masters ?? []).includes(k);
  return (
    <div className="mt-2 flex flex-col gap-1.5" data-testid={`patch-hand-${i}`}>
      {rows.map(([key, label, min, max, step, value, show]) => (
        <div key={String(key)} className="flex items-center gap-2">
          <span className="text-[12px] text-white/60 w-12">{label}</span>
          <input
            type="range" min={min} max={max} step={step}
            value={value}
            aria-label={label}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              // A pour's volume at 0 is a wash of dye again, as before it had one.
              put(key === 'volume' && v <= 0 ? { volume: undefined, drops: undefined } : { [key]: v });
            }}
            className="set-range flex-1"
            style={{ '--fill': `${Math.round(100 * (value - min) / Math.max(1e-9, max - min))}%` } as React.CSSProperties}
            data-testid={`patch-${String(key)}-${i}`}
          />
          <span className="text-[12px] font-mono text-dim w-12 text-right">{show(value)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 min-h-[28px]">
        <span className="text-[12px] text-white/60">Rides</span>
        <div className="flex items-center gap-1">
          {CORD_MASTERS.map(c => (
            <button
              key={c.key}
              type="button"
              aria-pressed={has(c.key)}
              onClick={() => {
                const ms = has(c.key) ? (m.masters ?? []).filter(k => k !== c.key) : [...(m.masters ?? []), c.key];
                put({ masters: ms.length ? ms : undefined });
              }}
              className={`min-h-6 px-2.5 rounded text-[12px] font-medium border ${has(c.key) ? LIT : 'bg-transparent border-white/10'}`}
              data-testid={`patch-master-${c.key}-${i}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const ROLE_NAMES: Record<string, string> = {
  pulse: 'Pulse', heat: 'Heat', press: 'Press', bloom: 'Kick Bloom', stream: 'Stream', swell: 'Swell', bottle: 'Bottle',
};

/*
  The music's own cords, folded into one row of the patch bay until opened
  (38v-1). Every look carries seven of them now, each with its hand's dials,
  and drawn open they made Patches about five screens deep at the desk's
  size (`npm run qa` holds every section under three, "and no section is
  more than three screens deep"), with the look's own patches pushed below
  them. Folded they are still one press from every dial, and this row says
  which hands there are and what they ride.
*/
export function MusicHandsFold({ roles, open, onToggle }: { roles: readonly string[]; open: boolean; onToggle: () => void }) {
  if (roles.length === 0) return null;
  const names = [...new Set(roles)].map(r => ROLE_NAMES[r] ?? r).join(', ');
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="w-full text-left rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 p-2"
      data-testid="music-hands-fold"
    >
      <div className="flex items-center justify-between text-[12px] font-medium text-text">
        <span>The music's hands, {roles.length} cords</span>
        <span className={open ? 'text-text-2' : 'text-dim'}>{open ? 'Fold' : 'Open'}</span>
      </div>
      <div className="text-[12px] text-dim mt-0.5">{names}, on Sound Drive</div>
    </button>
  );
}
