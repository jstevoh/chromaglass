import React, { useEffect, useRef } from 'react';
import {
  BAND_COUNT,
  BAND_HIGH_HZ,
  BAND_LOW_HZ,
   bandEdgesFor,
  bandForHz,
  BandRange,
  sourceValue,
  type AudioReading,
  type BandSource,
  type SourceName,
} from '../../lib/audioFeatures';

const LOG_SPAN = Math.log(BAND_HIGH_HZ / BAND_LOW_HZ);
const MIN_LOG_WIDTH = 0.04;
const EDGE_GRAB = 0.06;

const hzToX = (hz: number): number =>
  Math.max(0, Math.min(1, Math.log(Math.max(BAND_LOW_HZ, Math.min(BAND_HIGH_HZ, hz)) / BAND_LOW_HZ) / LOG_SPAN));

const xToHz = (x: number): number =>
  BAND_LOW_HZ * Math.exp(Math.max(0, Math.min(1, x)) * LOG_SPAN);

const fmtHz = (hz: number): string =>
  hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}k` : `${Math.round(hz)}`;

/**
 * Live log-frequency spectrum strip (`40 Hz`–`16 kHz`) for a `bands` patch cord
 * on the desk and the phone (PLAN 30a).
 *
 * Marks the eight fixed octave-ish bands (`BAND_EDGES_HZ`), draws the live
 * spectrum and the cord's own gained reading inside the active `[loHz, hiHz]`
 * window, and draws the gate's `threshold` line across that reading when in
 * gate mode. Dragging an edge or sweeping across the strip sets `band:
 * [loHz, hiHz]` and writes `feature` as the named band holding the drag's
 * geometric middle so an older build falls back cleanly.
 */
export function BandStrip({
  band,
  feature,
  gain = 1,
  threshold,
  readEar,
  onChange,
  testId,
}: {
  band?: [number, number];
  feature: string;
  gain?: number;
  threshold?: number;
  readEar?: () => AudioReading | null;
  onChange: (band: [number, number] | undefined, feature: BandSource) => void;
  testId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const rangeRef = useRef(new BandRange());
  const dragRef = useRef<{
    mode: 'left' | 'right' | 'slide' | 'sweep';
    anchorX: number;
    initX0: number;
    initX1: number;
  } | null>(null);

  const hasCustomBand = Array.isArray(band) && band.length === 2 && band[0] > 0 && band[1] > band[0];
  const [loHz, hiHz] = hasCustomBand ? band : bandEdgesFor(feature);
  const x0 = hzToX(loHz);
  const x1 = hzToX(hiHz);

  const propsRef = useRef({ hasCustomBand, loHz, hiHz, x0, x1, feature, gain, threshold, readEar });
  propsRef.current = { hasCustomBand, loHz, hiHz, x0, x1, feature, gain, threshold, readEar };

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const cvs = canvasRef.current;
      if (cvs) {
        const ctx = cvs.getContext('2d');
        if (ctx) {
          const W = cvs.width;
          const H = cvs.height;
          const {
            hasCustomBand: custom,
            loHz: lo,
            hiHz: hi,
            x0: bx0,
            x1: bx1,
            feature: feat,
            gain: g,
            threshold: th,
            readEar: getEar,
          } = propsRef.current;

          ctx.clearRect(0, 0, W, H);
          ctx.fillStyle = '#0b0910';
          ctx.fillRect(0, 0, W, H);

          // The eight fixed bands' dividers and labels.
          ctx.strokeStyle = 'rgba(255,255,255,0.10)';
          ctx.lineWidth = 1;
          ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          for (let i = 0; i < BAND_COUNT; i++) {
            const sx = (i / BAND_COUNT) * W;
            if (i > 0) {
              ctx.beginPath();
              ctx.moveTo(sx, 0);
              ctx.lineTo(sx, H);
              ctx.stroke();
            }
            ctx.fillText(String(i + 1), sx + 4, 11);
          }

          const reading = getEar?.() ?? null;
          let liveLevel = 0;
          if (reading) {
            if (reading.spectrum && reading.hzPerBin && reading.spectrum.length > 2) {
              const spec = reading.spectrum;
              const hzPerBin = reading.hzPerBin;
              const floor = reading.floor ?? -120;
              ctx.beginPath();
              ctx.moveTo(0, H);
              const steps = 64;
              for (let s = 0; s <= steps; s++) {
                const u = s / steps;
                const hz = xToHz(u);
                const k = Math.max(1, Math.min(spec.length - 1, Math.round(hz / hzPerBin)));
                const norm = Math.max(0, Math.min(1, (spec[k] - floor) / 48));
                ctx.lineTo(u * W, H - norm * (H - 6));
              }
              ctx.lineTo(W, H);
              ctx.closePath();
              ctx.fillStyle = 'rgba(255,255,255,0.14)';
              ctx.fill();
            } else if (reading.bands) {
              ctx.fillStyle = 'rgba(255,255,255,0.14)';
              for (let i = 0; i < BAND_COUNT; i++) {
                const v = Math.max(0, Math.min(1, reading.bands[i] ?? 0));
                const bh = v * (H - 6);
                ctx.fillRect((i / BAND_COUNT) * W + 1, H - bh, W / BAND_COUNT - 2, bh);
              }
            }
            const raw = custom
              ? rangeRef.current.read(reading, [lo, hi])
              : sourceValue(reading, (feat.startsWith('band') ? feat : bandForHz(Math.sqrt(lo * hi))) as SourceName);
            liveLevel = Math.max(0, Math.min(1, raw * (Number.isFinite(g) ? g : 1)));
          }

          // Active band window and the cord's own gained live reading inside it.
          const px0 = bx0 * W;
          const pw = Math.max(4, (bx1 - bx0) * W);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(px0, 0, pw, H);

          if (liveLevel > 0) {
            const lh = liveLevel * H;
            ctx.fillStyle = 'rgba(244, 180, 96, 0.38)';
            ctx.fillRect(px0, H - lh, pw, lh);
            ctx.fillStyle = 'rgba(255, 220, 150, 0.9)';
            ctx.fillRect(px0, H - lh, pw, 2);
          }

          // Threshold line drawn across the cord's own live reading when gated.
          if (th !== undefined && Number.isFinite(th)) {
            const ty = Math.round((1 - Math.max(0, Math.min(1, th))) * (H - 2)) + 1;
            ctx.save();
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
            ctx.beginPath();
            ctx.moveTo(0, ty);
            ctx.lineTo(W, ty);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px0, ty);
            ctx.lineTo(px0 + pw, ty);
            ctx.stroke();
            ctx.restore();
          }

          // Band edges & thumb handles.
          ctx.strokeStyle = custom ? 'rgba(255, 220, 150, 0.9)' : 'rgba(255, 255, 255, 0.65)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px0 + 0.75, 0.75, Math.max(2, pw - 1.5), H - 1.5);
          ctx.fillStyle = custom ? 'rgba(255, 220, 150, 0.95)' : 'rgba(255, 255, 255, 0.8)';
          ctx.fillRect(px0, H / 2 - 8, 3, 16);
          ctx.fillRect(px0 + pw - 3, H / 2 - 8, 3, 16);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const applySpan = (nx0: number, nx1: number) => {
    const c0 = Math.max(0, Math.min(1 - MIN_LOG_WIDTH, nx0));
    const c1 = Math.max(c0 + MIN_LOG_WIDTH, Math.min(1, nx1));
    const lo = Math.max(BAND_LOW_HZ, Math.round(xToHz(c0)));
    const hi = Math.min(BAND_HIGH_HZ, Math.max(lo + 5, Math.round(xToHz(c1))));
    const mid = bandForHz(Math.sqrt(lo * hi));
    onChange([lo, hi], mid);
  };

  const relX = (clientX: number): number => {
    const r = stripRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0.5;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div
        ref={stripRef}
        role="slider"
        tabIndex={0}
        aria-label="Frequency band"
        aria-valuemin={BAND_LOW_HZ}
        aria-valuemax={BAND_HIGH_HZ}
        aria-valuenow={Math.round(Math.sqrt(loHz * hiHz))}
        aria-valuetext={`${Math.round(loHz)} to ${Math.round(hiHz)} Hz`}
        data-testid={testId ? `${testId}-canvas` : undefined}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const x = relX(e.clientX);
          const dLeft = Math.abs(x - x0);
          const dRight = Math.abs(x - x1);
          if (dLeft <= EDGE_GRAB && dLeft <= dRight) {
            dragRef.current = { mode: 'left', anchorX: x, initX0: x0, initX1: x1 };
          } else if (dRight <= EDGE_GRAB) {
            dragRef.current = { mode: 'right', anchorX: x, initX0: x0, initX1: x1 };
          } else if (x > x0 && x < x1) {
            dragRef.current = { mode: 'slide', anchorX: x, initX0: x0, initX1: x1 };
          } else {
            const half = Math.max(MIN_LOG_WIDTH, Math.min(0.08, (x1 - x0) / 2));
            dragRef.current = { mode: 'sweep', anchorX: x, initX0: x0, initX1: x1 };
            applySpan(x - half, x + half);
          }
        }}
        onPointerMove={(e) => {
          const st = dragRef.current;
          if (!st) return;
          const x = relX(e.clientX);
          if (st.mode === 'left') {
            applySpan(Math.min(x, st.initX1 - MIN_LOG_WIDTH), st.initX1);
          } else if (st.mode === 'right') {
            applySpan(st.initX0, Math.max(x, st.initX0 + MIN_LOG_WIDTH));
          } else if (st.mode === 'slide') {
            const width = st.initX1 - st.initX0;
            const n0 = Math.max(0, Math.min(1 - width, st.initX0 + (x - st.anchorX)));
            applySpan(n0, n0 + width);
          } else {
            const loX = Math.min(st.anchorX, x);
            const hiX = Math.max(st.anchorX, x);
            if (hiX - loX >= MIN_LOG_WIDTH) {
              applySpan(loX, hiX);
            }
          }
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
        onKeyDown={(e) => {
          const step = 0.03;
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const w = x1 - x0;
            const n0 = Math.max(0, x0 - step);
            applySpan(n0, n0 + w);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const w = x1 - x0;
            const n1 = Math.min(1, x1 + step);
            applySpan(n1 - w, n1);
          }
        }}
        className="relative h-14 w-full rounded border border-white/15 bg-black/50 overflow-hidden cursor-ew-resize touch-none select-none"
      >
        <canvas
          ref={canvasRef}
          width={280}
          height={56}
          className="h-full w-full block pointer-events-none"
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-white/55">
        <span className="font-mono" data-testid={testId ? `${testId}-range` : undefined}>
          {fmtHz(loHz)}–{fmtHz(hiHz)} Hz{hasCustomBand ? ' · custom band' : ' · drag to tune band'}
        </span>
        {hasCustomBand && (
          <button
            type="button"
            onClick={() => onChange(undefined, bandForHz(Math.sqrt(loHz * hiHz)))}
            className="min-h-6 px-2 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-[11px] text-white/75"
            data-testid={testId ? `${testId}-reset` : undefined}
          >
            Fixed band
          </button>
        )}
      </div>
    </div>
  );
}
