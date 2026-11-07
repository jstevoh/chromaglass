/**
 * Three owed lines in `npm run framereads`, for frame items Antigravity builds
 * from a number (PLAN docs/plan/40-specs-frame-gig-desk.md, H2c-6, H2c-7 and
 * H2c-9), in a module beside framereads.mjs so that each stays small.
 *
 * Each line is printed as owed while it fails and is red the day it passes
 * with its id still in `--owed` (scripts/checks.json), so the PR that ships one
 * takes its id out and never edits the line; a build that is there and misses
 * is red, owed or not (the convention of encode-owed.mjs and rungs-owed.mjs).
 * Every number is counted from the GPU calls themselves (the prototypes'
 * dispatches, copies, textures and passes), never from what the code under
 * test says about itself, so work moved under another name is still seen.
 *
 * H2c-7, the readback straight into its ring. `readbackAsync`
 * (src/gpu/fluid/reads.ts) downsamples each field into `readTarget`, copies
 * that into `rbStaging`, and only then asks the ring for a free slot and
 * copies the staging buffer into it: every readback copies each field twice,
 * and when both slots are still in flight (which is when the GPU is behind)
 * it still downsamples and copies into staging, and throws the work away.
 * The line asks for at most one field's bytes copied a field a readback
 * (main: two), and for asks that find the ring full to ask the GPU for
 * nothing: no dispatch and no copy. Its controls hold on main and after: the
 * busy asks really found the ring full (its `issued` count, the slots' own
 * sequence, stopped rising), and the frame after them, with a slot free
 * again, reads the plate back as it was last written, the mirror equal to
 * the field read straight out.
 *
 * H2c-6, no aux target while the camera is off. The display's render pass
 * (`WebGPUPlate.display`, src/gpu/plate.ts) writes two targets, the picture
 * and the aux (the normal, the dye's height, the bubble mask, which only the
 * camera pass reads), and `draw` allocates the aux at the frame's size every
 * time, camera or not. The plate already knows whether the camera will draw:
 * the app fills `cameraOn` into the plate's own uniforms (`fillPlateUniforms`,
 * LiquidVisualizer's `cameraOn: !!cam`), so the build reads it there and
 * `draw`'s signature stays as it is. The line draws a plate kept across
 * frames (scripts/lab-plateframes.ts) with the camera off from its first
 * frame, and asks for the display pass to write one target and no texture at
 * the frame's size to be alive but the wall it draws into. The frame is
 * drawn at 72² over a 128² grid so a texture at the frame's size can only
 * be a frame target. Its control holds on main and after: with the camera on,
 * two targets and `auxTarget` there for the camera pass.
 *
 * H2c-9, pack only after a step. `draw` runs `packDye` and `packVel` on every
 * frame, and at 120 Hz against sixty steps half of those pack fields that
 * have not changed. The plate cannot see the solver, so the caller says: the
 * contract this line holds the build to is a count, `WebGPUFluid.fieldWrites`
 * (the solver's count of submits that may have changed a field, the one its
 * ReadGate already keeps for the readbacks, PLAN 14ab-3), handed to `draw` on
 * each layer as `writes`, and a layer packed only when its `writes` differs
 * from the one it was last packed at, or is absent (a caller that does not
 * say, such as `lab.render`, packs every frame as today). The line draws 60
 * frames stepping on every other one, as a 120 Hz display at sixty steps does
 * for half a second, and asks for at most 31 of them to dispatch anything
 * (the 30 steps and the first frame). Its controls hold on main and after,
 * and are what keeps the skip honest: on a frame with no step the kept
 * plate's picture is the picture a fresh plate draws of the same fields, to
 * the byte, and so is the picture after a pour with no step after it (a
 * write that is not a step, which a skip keyed on steps alone would miss).
 */

export const FRAMEREADS_OWED = ['h2c6', 'h2c7', 'h2c9'];

/** The frame a 120 Hz display draws in half a second, stepping on every other one. */
const FRAMES = 60;
const SIZE = 72;

export async function owedLines(page, check) {
  const flag = process.argv.find((a) => a.startsWith('--owed='));
  const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
  const unknown = [...owed].filter((id) => !FRAMEREADS_OWED.includes(id));
  if (unknown.length) check('every id in --owed is a line of framereads', false, `unknown: ${unknown.join(', ')} (known: ${FRAMEREADS_OWED.join(', ')})`);
  const line = (id, name, ok, detail, mainState) => {
    if (!owed.has(id)) return check(name, ok, detail);
    if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
    if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
    console.log(` owed  ${name} — ${detail}`);
  };

  const r = await page.evaluate(async ({ frames, size }) => {
    const s = lab.solver();
    const settle = async () => { await s.device.queue.onSubmittedWorkDone(); await new Promise((res) => setTimeout(res, 16)); };
    const c = { on: false, dispatches: 0, copies: 0, bytes: 0 };
    const zero = () => { c.dispatches = 0; c.copies = 0; c.bytes = 0; };
    const hooks = [];
    const hook = (proto, name, wrap) => {
      const was = proto[name];
      proto[name] = wrap(was);
      hooks.push(() => { proto[name] = was; });
    };
    // Textures at the frame's size alive, the views back to their textures, and the display pass's attachments.
    const live = new Set();
    const viewOf = new WeakMap();
    const frame = { on: false, attachments: 0 };
    try {
      hook(GPUComputePassEncoder.prototype, 'dispatchWorkgroups', (was) => function (...a) { if (c.on) c.dispatches++; return was.apply(this, a); });
      hook(GPUComputePassEncoder.prototype, 'dispatchWorkgroupsIndirect', (was) => function (...a) { if (c.on) c.dispatches++; return was.apply(this, a); });
      hook(GPUCommandEncoder.prototype, 'copyTextureToBuffer', (was) => function (src, dst, extent) {
        if (c.on) { c.copies++; c.bytes += dst.bytesPerRow * (extent[1] ?? extent.height ?? 1); }
        return was.call(this, src, dst, extent);
      });
      hook(GPUCommandEncoder.prototype, 'copyBufferToBuffer', (was) => function (...a) {
        if (c.on) { c.copies++; c.bytes += typeof a[1] === 'number' ? a[4] : (a[2] ?? a[0].size); }
        return was.apply(this, a);
      });
      hook(GPUCommandEncoder.prototype, 'copyTextureToTexture', (was) => function (src, dst, extent) {
        if (c.on) { c.copies++; c.bytes += 16 * (extent[0] ?? extent.width) * (extent[1] ?? extent.height ?? 1); }
        return was.call(this, src, dst, extent);
      });
      hook(GPUDevice.prototype, 'createTexture', (was) => function (d) {
        const t = was.call(this, d);
        const [w, h] = Array.isArray(d.size) ? d.size : [d.size.width, d.size.height];
        if (frame.on && w === size && h === size && d.label !== 'plateframes wall') live.add(t);
        return t;
      });
      hook(GPUTexture.prototype, 'destroy', (was) => function () { live.delete(this); return was.call(this); });
      hook(GPUTexture.prototype, 'createView', (was) => function (...a) { const v = was.apply(this, a); viewOf.set(v, this); return v; });
      hook(GPUCommandEncoder.prototype, 'beginRenderPass', (was) => function (d) {
        const atts = (d?.colorAttachments ?? []).filter(Boolean);
        if (frame.on && atts.some((a) => viewOf.get(a.view)?.label === 'plateframes wall')) frame.attachments = atts.length;
        return was.call(this, d);
      });

      // ── H2c-7: the ring ─────────────────────────────────────────
      const write = (k) => { lab.dye(0.3 + 0.05 * k, 0.6, 0.06, [0.4, 1.1, 0.5], 1); lab.flush(); };
      const ask = () => {
        const before = s.rbDyeIssued;
        zero(); c.on = true;
        s.readbackAsync();
        c.on = false;
        return { took: s.rbDyeIssued - before, dispatches: c.dispatches, copies: c.copies, bytes: c.bytes };
      };
      await settle(); s.readbackAsync(); await settle(); s.readbackAsync();
      write(0);
      const free = ask();
      await settle(); s.readbackAsync(); await settle();
      // Asked again and again in one task, a write before each, as frames that
      // come round faster than the mappings land: the ring fills, then is full.
      const calls = [];
      for (let k = 1; k <= 8; k++) { write(k); calls.push(ask()); }
      const filled = calls.findIndex((x) => x.took === 0);
      const busy = filled < 0 ? [] : calls.slice(filled);
      await settle(); await settle();
      const after = ask();
      await settle(); s.readbackAsync(); await settle(); s.readbackAsync();
      const field = await s.readField('dye');
      let off = 0;
      for (let i = 0; i < field.length; i++) off = Math.max(off, Math.abs(field[i] - s.rbDyeView[i]));
      const ring = {
        L: s.L, free, filled, busyCalls: busy.length, busyTook: busy.reduce((a, x) => a + x.took, 0),
        busyDispatches: busy.reduce((a, x) => a + x.dispatches, 0), busyCopies: busy.reduce((a, x) => a + x.copies, 0),
        after: after.took, off,
      };

      // ── H2c-6: the aux target ───────────────────────────────────
      const f = lab.frames;
      f.dispose();
      const drawn = async (o) => {
        frame.on = true; frame.attachments = 0;
        try { await f.draw(size, o); } finally { frame.on = false; }
        return { attachments: frame.attachments, alive: live.size };
      };
      let off6;
      for (let k = 0; k < 3; k++) off6 = await drawn({ camera: false });
      let on6;
      for (let k = 0; k < 2; k++) on6 = await drawn({ camera: true });
      const auxOn = !!f.plate?.auxTarget;
      let offAgain;
      for (let k = 0; k < 2; k++) offAgain = await drawn({ camera: false });
      f.dispose();
      live.clear();
      const aux = { off: off6, on: on6, auxOn, offAgain };

      // ── H2c-9: the pack ─────────────────────────────────────────
      const p = { thinGap: 1 };
      await lab.step(2, p);
      await f.draw(size, { writes: true });
      let packing = 0, packs = 0;
      for (let i = 0; i < frames; i++) {
        if (i % 2 === 0) await lab.step(1, p);
        zero(); c.on = true;
        await f.draw(size, { writes: true });
        c.on = false;
        if (c.dispatches) packing++;
        packs += c.dispatches;
      }
      const same = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
      // A frame with no step after one with a step, against a fresh plate.
      await lab.step(1, p);
      await f.draw(size, { writes: true });
      const kept = await f.draw(size, { writes: true, read: true });
      const fresh = await f.draw(size, { writes: true, read: true, fresh: true });
      const stillOff = same(kept, fresh);
      // A pour with no step after it.
      lab.dye(0.62, 0.4, 0.14, [0.3, 0.6, 1.4], 3);
      lab.flush();
      const poured = await f.draw(size, { writes: true, read: true });
      const pouredFresh = await f.draw(size, { writes: true, read: true, fresh: true });
      const pourOff = same(poured, pouredFresh);
      const pourMoved = same(kept, pouredFresh);
      f.dispose();
      const pack = { packing, packs, stillOff, pourOff, pourMoved, pixels: kept.length / 4, writes: typeof s.fieldWrites };
      return { ring, aux, pack };
    } finally {
      for (const undo of hooks.reverse()) undo();
    }
  }, { frames: FRAMES, size: SIZE });

  const { ring, aux, pack } = r;
  const fieldBytes = ring.L * ring.L * 16;
  const perField = ring.free.bytes / (2 * fieldBytes);
  console.log(`  the ring: one readback with its slots free copies ${ring.free.bytes} bytes in ${ring.free.copies} copies (${perField.toFixed(2)}x the two fields' ${2 * fieldBytes}) with ${ring.free.dispatches} dispatches; ` +
    `asked ${ring.busyCalls} more times once full, ${ring.busyDispatches} dispatches and ${ring.busyCopies} copies`);
  console.log(`  the aux: camera off ${aux.off.attachments} display targets, ${aux.off.alive} frame-size textures alive; on ${aux.on.attachments} and ${aux.on.alive} (auxTarget ${aux.auxOn ? 'there' : 'null'}); off again ${aux.offAgain.attachments} and ${aux.offAgain.alive}`);
  console.log(`  the pack: ${FRAMES} frames, a step on every other one: ${pack.packing} frames dispatched ${pack.packs} pack dispatches (fieldWrites is ${pack.writes} on this solver)`);

  check('control: the counting sees a readback\'s work (its downsample and its copies, slots free)', ring.free.took === 1 && ring.free.dispatches >= 2 && ring.free.bytes >= 2 * fieldBytes,
    `${ring.free.dispatches} dispatches, ${ring.free.bytes} bytes`);
  check('control: asked faster than it lands, the ring fills and then takes no copy (its slots really are in flight)', ring.filled >= 1 && ring.busyCalls >= 3 && ring.busyTook === 0,
    `full after ${ring.filled} asks, ${ring.busyCalls} asks after with ${ring.busyTook} taken`);
  check('control: the frame after the busy ones reads the plate back as last written', ring.after === 1 && ring.off === 0, `${ring.after} taken, the mirror off the field by ${ring.off}`);
  line('h2c7', 'H2c-7: a readback copies each field once, straight into its ring, and a full ring asks the GPU for nothing',
    perField <= 1 && ring.busyDispatches === 0 && ring.busyCopies === 0,
    `${perField.toFixed(2)}x a field's bytes a field (at most 1, main 2), ${ring.busyDispatches} dispatches and ${ring.busyCopies} copies in ${ring.busyCalls} full asks (want 0)`,
    Math.abs(perField - 2) < 0.01 && ring.busyDispatches === 2 * ring.busyCalls);

  check('control: with the camera on the display writes its aux and the plate hands it to the camera pass', aux.on.attachments === 2 && aux.on.alive >= 1 && aux.auxOn,
    `${aux.on.attachments} targets, ${aux.on.alive} alive, auxTarget ${aux.auxOn ? 'there' : 'null'}`);
  line('h2c6', 'H2c-6: with the camera off the display writes one target and no aux texture is alive',
    aux.off.attachments === 1 && aux.off.alive === 0,
    `${aux.off.attachments} targets (want 1, main 2), ${aux.off.alive} frame-size textures alive (want 0, main 1)`,
    aux.off.attachments === 2 && aux.off.alive === 1);

  check('control: on a frame with no step the kept plate draws what a fresh plate draws of the same fields', pack.stillOff === 0, `${pack.stillOff} of ${pack.pixels} pixels differ`);
  check('control: a pour with no step after it is drawn, as a fresh plate draws it', pack.pourOff === 0 && pack.pourMoved > 0,
    `${pack.pourOff} pixels differ from the fresh plate's; the pour moved ${pack.pourMoved}`);
  line('h2c9', `H2c-9: at 120 Hz against sixty steps the plate packs only after a step (at most ${FRAMES / 2 + 1} of ${FRAMES} frames)`,
    pack.packing <= FRAMES / 2 + 1 && pack.packs <= 2 * (FRAMES / 2 + 1),
    `${pack.packing} frames packed with ${pack.packs} dispatches (at most ${FRAMES / 2 + 1} and ${FRAMES + 2}; main ${FRAMES} and ${2 * FRAMES})`,
    pack.packing === FRAMES && pack.packs === 2 * FRAMES);
}
