/**
 * The WebGPU stage: the canvas, the device, and one frame at a time
 * (docs/webgpu-plan.md). Under `?renderer=webgpu` only, until the cutover.
 *
 * P1 draws the black plate: the kit, the start-up and the frame loop, proved
 * before anything is drawn with them. The solver arrives in P2 and the
 * compositor in P3, as passes encoded into this same frame.
 */

import { requestGpu, type Gpu, type GpuFailure, isGpuFailure } from './device';
import { Disposer, GpuProfiler, PipelineCache } from './kit';

export class WebGPUStage {
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
  readonly disposer = new Disposer();
  readonly pipelines: PipelineCache;
  readonly profiler: GpuProfiler;
  /** Frames drawn since the start. */
  frames = 0;
  private disposed = false;

  private constructor(readonly gpu: Gpu, readonly canvas: HTMLCanvasElement, context: GPUCanvasContext) {
    this.context = context;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.pipelines = new PipelineCache(gpu.device);
    this.profiler = new GpuProfiler(gpu.device, this.disposer, gpu.timestamps);
    this.configure();
  }

  /**
   * The device and the canvas, or why not. The canvas must not have been
   * given a WebGL context: a canvas holds one kind of context for life.
   */
  static async start(canvas: HTMLCanvasElement): Promise<WebGPUStage | GpuFailure> {
    const gpu = await requestGpu();
    if (isGpuFailure(gpu)) return gpu;
    const context = canvas.getContext('webgpu');
    if (!context) {
      gpu.device.destroy();
      return { failure: 'no-webgpu', detail: 'the canvas refused a webgpu context' };
    }
    return new WebGPUStage(gpu, canvas, context);
  }

  get device(): GPUDevice { return this.gpu.device; }
  /** Settles when the device is lost (recovery arrives in P4). */
  get lost(): Promise<GPUDeviceLostInfo> { return this.gpu.device.lost; }

  private configure(): void {
    this.context.configure({
      device: this.gpu.device,
      format: this.format,
      alphaMode: 'opaque',
      // COPY_SRC so grabFrame can read the frame: WebGPU has no preserveDrawingBuffer.
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
  }

  /** Encode and submit one frame into the canvas's current texture. */
  frame(): GPUTexture {
    const device = this.gpu.device;
    const target = this.context.getCurrentTexture();
    const encoder = device.createCommandEncoder({ label: 'frame' });
    const pass = encoder.beginRenderPass({
      label: 'plate',
      colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      timestampWrites: this.profiler.pass('plate'),
    });
    pass.end();
    this.profiler.resolveInto(encoder);
    device.queue.submit([encoder.finish()]);
    this.profiler.afterSubmit();
    this.frames++;
    return target;
  }

  /**
   * The picture, read back as RGBA rows from the top. For the harnesses: a
   * presented WebGPU canvas reads black to drawImage, so this draws a frame
   * and copies it out in the same task.
   */
  async grabFrame(): Promise<{ width: number; height: number; pixels: Uint8Array }> {
    const device = this.gpu.device;
    const tex = this.frame();
    const { width, height } = tex;
    const row = Math.ceil((width * 4) / 256) * 256;
    const buf = device.createBuffer({ size: row * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder({ label: 'grab' });
    encoder.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [width, height]);
    device.queue.submit([encoder.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const padded = new Uint8Array(buf.getMappedRange());
    const pixels = new Uint8Array(width * height * 4);
    const bgra = this.format.startsWith('bgra');
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = y * row + x * 4, d = (y * width + x) * 4;
        pixels[d] = padded[s + (bgra ? 2 : 0)];
        pixels[d + 1] = padded[s + 1];
        pixels[d + 2] = padded[s + (bgra ? 0 : 2)];
        pixels[d + 3] = padded[s + 3];
      }
    }
    buf.unmap();
    buf.destroy();
    return { width, height, pixels };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposer.dispose();
    try { this.context.unconfigure(); } catch { /* already gone */ }
    this.gpu.device.destroy();
  }
}
