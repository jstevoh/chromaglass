/**
 * GPU plate snapshot & restore for destructive action Undo (PLAN 49a): copies
 * live textures and thin-gap buffers on the same device so New plate, Drain,
 * Clear and Randomise restore the exact liquid on the glass without replaying.
 */

import type { PingPong } from '../kit';
import type { SolverSnapshot } from '../solverTypes';
import type { CoverState } from '../../lib/cover';

export interface SnapshotScalars {
  phaseLive: boolean;
  mixLive: boolean;
  oilPoured: number;
  /** The oil's tension, N/m (FluidCore.oilSigma, PLAN 38e). */
  oilSigma: number;
  oilDyeStale: boolean;
  bodiesWanted: boolean;
  oilLayPending: boolean;
  liquidsLive: boolean;
  speciesLive: boolean;
  speciesClears: number;
  speciesPoured: { sigma: number; rho: number } | null;
  speciesSnap: { L: number; data: Float32Array; poured: { sigma: number; rho: number } } | null;
  speciesDisp: number;
  lastSpeciesCarry: 'pair' | 'alone' | null;
  chemLive: boolean;
  reagentLive: boolean;
  rxnLive: boolean;
  liesLive: boolean;
  swirlLive: boolean;
  swirlTail: number;
  boilLive: boolean;
  boilFresh: boolean;
  boilTail: number;
  airPush: number;
  airCover: number;
  airCoverPrev: number;
  airQuietSeconds: number;
  filmLaid: number;
  grainAge: number;
  heatSeconds: number;
  coverGap: number;
  lastCurve: number | null;
  thinLive: boolean;
  hsPrimed: boolean;
  phaseGapPrimed: boolean;
  glassFlow: [number, number];
  cover: CoverState | null;
  coverMl: number;
  coverPoured: number;
  coverLaid: number;
}

export interface SnapshotTargets {
  device: GPUDevice;
  n: number;
  m: number;
  disposed: boolean;
  submit: (enc: GPUCommandEncoder) => void;
  dye: PingPong;
  vel: PingPong;
  velForced: GPUTexture;
  squeeze: PingPong;
  cur: PingPong;
  swirl: PingPong;
  phase: PingPong;
  mix: PingPong | null;
  ensureMix: () => PingPong;
  oilDye: PingPong | null;
  ensureOilDye: () => PingPong;
  liquids0: PingPong;
  liquids1: PingPong;
  species: PingPong | null;
  ensureSpecies: () => PingPong;
  chem: PingPong;
  activeMat: PingPong;
  rxn: PingPong | null;
  ensureRxn: () => PingPong;
  lies: PingPong | null;
  ensureLies: () => PingPong;
  boilAlpha: PingPong | null;
  ensureBoilAlpha: () => PingPong;
  film: PingPong | null;
  ensureFilm: () => PingPong;
  hsGap: GPUBuffer | null;
  hsP: GPUBuffer | null;
  hsP2: GPUBuffer | null;
  ensureThinGap: () => GPUTexture;
  scalars: SnapshotScalars;
}

export interface FieldSnapshot extends SolverSnapshot {
  readonly device: GPUDevice;
  readonly n: number;
  readonly scalars: SnapshotScalars;
  readonly dye: GPUTexture;
  readonly vel: GPUTexture;
  readonly velForced: GPUTexture;
  readonly squeeze: GPUTexture;
  readonly cur: GPUTexture;
  readonly swirl: GPUTexture;
  readonly phase: GPUTexture | null;
  readonly mix: GPUTexture | null;
  readonly oilDye: GPUTexture | null;
  readonly liquids0: GPUTexture | null;
  readonly liquids1: GPUTexture | null;
  readonly species: GPUTexture | null;
  readonly chem: GPUTexture | null;
  readonly activeMat: GPUTexture | null;
  readonly rxn: GPUTexture | null;
  readonly lies: GPUTexture | null;
  readonly boilAlpha: GPUTexture | null;
  readonly film: GPUTexture | null;
  readonly hsGap: GPUBuffer | null;
  readonly hsP: GPUBuffer | null;
  readonly hsP2: GPUBuffer | null;
}

/** Capture live GPU fields onto off-screen textures and buffers owned by this snapshot. */
export function captureFluidSnapshot(t: SnapshotTargets): FieldSnapshot | null {
  if (t.disposed) return null;
  const enc = t.device.createCommandEncoder({ label: 'plate undo snapshot' });
  const texs: GPUTexture[] = [];
  const bufs: GPUBuffer[] = [];

  const copyTex = (src: GPUTexture, label: string): GPUTexture => {
    const out = t.device.createTexture({
      label: `undo ${label}`,
      size: [src.width, src.height],
      format: src.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
    });
    enc.copyTextureToTexture({ texture: src }, { texture: out }, [src.width, src.height]);
    texs.push(out);
    return out;
  };
  const copyPp = (pp: PingPong | null, active: boolean): GPUTexture | null =>
    pp && active ? copyTex(pp.read, pp.read.label) : null;
  const copyBuf = (src: GPUBuffer | null): GPUBuffer | null => {
    if (!src) return null;
    const out = t.device.createBuffer({
      label: `undo ${src.label}`,
      size: src.size,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    enc.copyBufferToBuffer(src, 0, out, 0, src.size);
    bufs.push(out);
    return out;
  };

  const s = t.scalars;
  const snap: FieldSnapshot = {
    device: t.device,
    n: t.n,
    scalars: {
      ...s,
      glassFlow: [s.glassFlow[0], s.glassFlow[1]],
      speciesPoured: s.speciesPoured ? { ...s.speciesPoured } : null,
      speciesSnap: s.speciesSnap
        ? { L: s.speciesSnap.L, data: new Float32Array(s.speciesSnap.data), poured: { ...s.speciesSnap.poured } }
        : null,
      cover: s.cover ? { ...s.cover } : null,
    },
    dye: copyTex(t.dye.read, 'dye'),
    vel: copyTex(t.vel.read, 'vel'),
    velForced: copyTex(t.velForced, 'velForced'),
    squeeze: copyTex(t.squeeze.read, 'squeeze'),
    cur: copyTex(t.cur.read, 'cur'),
    swirl: copyTex(t.swirl.read, 'swirl'),
    phase: copyPp(t.phase, s.phaseLive),
    mix: copyPp(t.mix, s.mixLive),
    oilDye: copyPp(t.oilDye, s.mixLive || s.bodiesWanted || s.oilPoured > 0),
    liquids0: copyPp(t.liquids0, s.liquidsLive),
    liquids1: copyPp(t.liquids1, s.liquidsLive),
    species: copyPp(t.species, s.speciesLive),
    chem: copyPp(t.chem, s.chemLive || s.reagentLive),
    activeMat: copyPp(t.activeMat, s.chemLive || s.reagentLive),
    rxn: copyPp(t.rxn, s.rxnLive),
    lies: copyPp(t.lies, s.liesLive),
    boilAlpha: copyPp(t.boilAlpha, s.boilLive),
    film: copyPp(t.film, s.filmLaid > 0),
    hsGap: s.thinLive && s.hsPrimed ? copyBuf(t.hsGap) : null,
    hsP: s.thinLive && s.hsPrimed ? copyBuf(t.hsP) : null,
    hsP2: s.thinLive && s.hsPrimed ? copyBuf(t.hsP2) : null,
    destroy: () => {
      for (const tex of texs.splice(0)) tex.destroy();
      for (const b of bufs.splice(0)) b.destroy();
    },
  };
  t.submit(enc);
  return snap;
}

/** Restore a GPU snapshot back onto a matching live solver. */
export function restoreFluidSnapshot(t: SnapshotTargets, snap: FieldSnapshot): boolean {
  if (t.disposed || snap.device !== t.device || snap.n !== t.n) return false;
  const enc = t.device.createCommandEncoder({ label: 'plate undo restore' });
  const putTex = (from: GPUTexture | null, dst: GPUTexture): boolean => {
    if (!from || from.width !== dst.width || from.height !== dst.height || from.format !== dst.format) return false;
    enc.copyTextureToTexture({ texture: from }, { texture: dst }, [dst.width, dst.height]);
    return true;
  };
  const putPp = (from: GPUTexture | null, pp: PingPong): boolean => putTex(from, pp.read);
  const putBuf = (from: GPUBuffer | null, dst: GPUBuffer | null) => {
    if (!from || !dst || from.size !== dst.size) return;
    enc.copyBufferToBuffer(from, 0, dst, 0, dst.size);
  };

  putPp(snap.dye, t.dye);
  putPp(snap.vel, t.vel);
  putTex(snap.velForced, t.velForced);
  putPp(snap.squeeze, t.squeeze);
  putTex(snap.squeeze, t.squeeze.write);
  putPp(snap.cur, t.cur);
  putPp(snap.swirl, t.swirl);

  if (snap.phase) putPp(snap.phase, t.phase);
  if (snap.mix) putPp(snap.mix, t.ensureMix());
  if (snap.oilDye) putPp(snap.oilDye, t.ensureOilDye());
  if (snap.liquids0 && snap.liquids1) {
    putPp(snap.liquids0, t.liquids0);
    putPp(snap.liquids1, t.liquids1);
  }
  if (snap.species) putPp(snap.species, t.ensureSpecies());
  if (snap.chem) putPp(snap.chem, t.chem);
  if (snap.activeMat) putPp(snap.activeMat, t.activeMat);
  if (snap.rxn) putPp(snap.rxn, t.ensureRxn());
  if (snap.lies) putPp(snap.lies, t.ensureLies());
  if (snap.boilAlpha) putPp(snap.boilAlpha, t.ensureBoilAlpha());
  if (snap.film) putPp(snap.film, t.ensureFilm());

  if (snap.hsGap || snap.hsP || snap.hsP2) {
    t.ensureThinGap();
    putBuf(snap.hsGap, t.hsGap);
    putBuf(snap.hsP, t.hsP);
    putBuf(snap.hsP2, t.hsP2);
  }

  t.submit(enc);
  return true;
}
