// The live analyser's settings and the offline copy of the node: moved out of
// audioFeatures.ts (PLAN 19ai, the size ratchet), which re-exports every name.

import { fft } from './fft.ts';

/**
 * The live analyser's settings, owned here so the hook and the offline path
 * cannot drift apart. A render analysed with a different window or smoothing
 * from the show would react to a different song.
 *
 * 1024 points: ~47 Hz bins at 48 kHz, enough to keep a kick (50–100 Hz) in
 * bins of its own apart from a snare's body (~200 Hz), with a 21 ms window,
 * little more than one video frame at 60 fps, so a hit is visible in the first
 * or second frame after it lands.
 */
export const ANALYSER_FFT_SIZE = 1024;
/** The AnalyserNode's own time smoothing (`smoothingTimeConstant`). */
export const ANALYSER_SMOOTHING = 0.6;
/**
 * How often that smoothing is applied live: the node smooths once per read,
 * and the hook reads once per animation frame. The offline path scales the
 * constant to its own frame rate against this, so a render at 30 fps smooths
 * over the same stretch of time as the show does at 60.
 */
export const ANALYSER_RATE_HZ = 60;

/**
 * The Web Audio AnalyserNode, in arithmetic, so a song file can be heard the
 * way the show hears the room.
 *
 * The spec's frequency-domain steps: the most recent fftSize samples, a
 * Blackman window (alpha 0.16, over N rather than N-1, as the spec writes
 * it), an FFT, magnitudes scaled by 1/N, smoothed against the previous
 * frame's by the time constant, then 20·log10. That is what
 * `getFloatFrequencyData` returns, and so what the live path passes in.
 *
 * `dtSec` is the time since the previous frame: live, the smoothing constant
 * is applied once per ANALYSER_RATE_HZ tick, so offline it is raised to the
 * number of ticks the frame spans, and a 30 fps render smooths over the same
 * 33 ms that two live frames would.
 */
export class AnalyserEmulator {
  readonly fftSize: number;
  readonly sampleRate: number;
  private readonly smoothing: number;
  private readonly window: Float32Array;
  private readonly re: Float32Array;
  private readonly im: Float32Array;
  private readonly smoothed: Float64Array;
  private readonly out: Float32Array;
  private readonly outTimeDomain: Uint8Array;

  constructor(sampleRate: number, fftSize = ANALYSER_FFT_SIZE, smoothing = ANALYSER_SMOOTHING) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    this.smoothing = smoothing;
    this.window = new Float32Array(fftSize);
    const a = 0.16, a0 = (1 - a) / 2, a1 = 0.5, a2 = a / 2;
    for (let i = 0; i < fftSize; i++) {
      const x = i / fftSize;
      this.window[i] = a0 - a1 * Math.cos(2 * Math.PI * x) + a2 * Math.cos(4 * Math.PI * x);
    }
    this.re = new Float32Array(fftSize);
    this.im = new Float32Array(fftSize);
    this.smoothed = new Float64Array(fftSize / 2);
    this.out = new Float32Array(fftSize / 2);
    this.outTimeDomain = new Uint8Array(fftSize);
  }

  /**
   * The spectrum of the fftSize samples ending just before sample `end`
   * (samples before 0 are silence), in dB. The returned arrays are reused by
   * the next call.
   */
  frame(pcm: Float32Array, end: number, dtSec: number): { bins: Float32Array, timeDomainData: Uint8Array } {
    const N = this.fftSize;
    const start = end - N;
    for (let i = 0; i < N; i++) {
      const s = start + i;
      const v = s >= 0 && s < pcm.length ? pcm[s] : 0;
      this.re[i] = v * this.window[i];
      this.im[i] = 0;
      // getByteTimeDomainData scales [-1, 1] to [0, 255]
      this.outTimeDomain[i] = Math.max(0, Math.min(255, Math.round(128 + v * 128)));
    }
    fft(this.re, this.im);
    const tau = Math.pow(this.smoothing, Math.max(0, dtSec) * ANALYSER_RATE_HZ);
    for (let k = 0; k < N / 2; k++) {
      const m = Math.hypot(this.re[k], this.im[k]) / N;
      this.smoothed[k] = tau * this.smoothed[k] + (1 - tau) * m;
      this.out[k] = this.smoothed[k] > 0 ? 20 * Math.log10(this.smoothed[k]) : -Infinity;
    }
    return { bins: this.out, timeDomainData: this.outTimeDomain };
  }
}
