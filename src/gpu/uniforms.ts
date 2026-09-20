/**
 * One declaration, two sides (docs/webgpu-plan.md, P3).
 *
 * The composite takes ninety-odd uniforms. Written by hand that is a WGSL
 * struct and a TypeScript writer that have to agree about the byte offset of
 * every one of them, and the first time someone adds a field to one and not
 * the other the picture goes subtly wrong with nothing to catch it.
 *
 * So the fields are declared once, here, and both sides are generated: the
 * struct that the shader includes, and the setters that fill the buffer. The
 * offsets come from WGSL's own alignment rules, applied in one place.
 *
 * Rules (WGSL spec, §address-space-layout-constraints): f32 and i32 align to
 * 4 and take 4; vec2 aligns to 8 and takes 8; vec3 aligns to 16 and takes 12;
 * vec4 aligns to 16 and takes 16; an array of vec4 aligns to 16; a struct's
 * size rounds up to its largest alignment.
 */

export type ScalarType = 'f32' | 'i32' | 'u32';
export type VectorType = 'vec2f' | 'vec3f' | 'vec4f';
export type FieldType = ScalarType | VectorType;

export interface Field {
  /** As the shader says it: `U.<name>`. */
  name: string;
  type: FieldType;
  /** How many of them; 1 unless it is an array. */
  count?: number;
  /** What it is, for the reader of the struct. */
  note?: string;
  /**
   * What the GLSL calls it, where that cannot be the WGSL's name — `macro` is
   * a reserved word there. Defaults to `u_` and the name.
   */
  glsl?: string;
}

const ALIGN: Record<FieldType, number> = { f32: 4, i32: 4, u32: 4, vec2f: 8, vec3f: 16, vec4f: 16 };
const SIZE: Record<FieldType, number> = { f32: 4, i32: 4, u32: 4, vec2f: 8, vec3f: 12, vec4f: 16 };
/** Floats in one of them, for the writer. */
const WIDTH: Record<FieldType, number> = { f32: 1, i32: 1, u32: 1, vec2f: 2, vec3f: 3, vec4f: 4 };

export interface Placed extends Field {
  /** Byte offset into the buffer. */
  offset: number;
  count: number;
}

export interface Layout {
  fields: Placed[];
  byName: Map<string, Placed>;
  /** Bytes, rounded up as WGSL rounds a struct. */
  size: number;
}

const roundUp = (n: number, to: number) => Math.ceil(n / to) * to;

/**
 * Where each field lands. Declaration order is kept — an array element's
 * stride is its own alignment, which for vec4 is its size.
 */
export function layOut(fields: Field[]): Layout {
  const placed: Placed[] = [];
  let at = 0;
  let widest = 4;
  for (const f of fields) {
    const count = f.count ?? 1;
    const align = ALIGN[f.type];
    widest = Math.max(widest, align);
    at = roundUp(at, align);
    placed.push({ ...f, count, offset: at });
    at += count > 1 ? count * roundUp(SIZE[f.type], align) : SIZE[f.type];
  }
  const byName = new Map(placed.map((p) => [p.name, p]));
  if (byName.size !== placed.length) throw new Error('two fields share a name');
  return { fields: placed, byName, size: roundUp(at, widest) };
}

/** The struct the shader includes, offsets spelled out so a reader can check them. */
export function wgslStruct(name: string, layout: Layout): string {
  const lines = layout.fields.map((f) => {
    const type = f.count > 1 ? `array<${f.type}, ${f.count}>` : f.type;
    const note = f.note ? `  // ${f.note}` : '';
    return `  @align(${ALIGN[f.type]}) ${f.name}: ${type},${note}`;
  });
  return `struct ${name} {\n${lines.join('\n')}\n};`;
}

/**
 * The buffer, and a setter that knows where everything goes.
 *
 * `set` takes the numbers as they come — one for a scalar, several for a
 * vector, a whole array for an array — and a name the layout does not know is
 * an error rather than a silent no-op, because that is exactly the drift this
 * file exists to prevent.
 */
export class UniformPack {
  readonly bytes: ArrayBuffer;
  private readonly f32: Float32Array;
  private readonly i32: Int32Array;
  /** The effects' frame counter and seed are unsigned: PCG hashing wants the wrap. */
  private readonly u32: Uint32Array;
  /** Names set since the last `clearSeen`, for a harness that checks coverage. */
  private readonly seen = new Set<string>();

  constructor(readonly layout: Layout) {
    this.bytes = new ArrayBuffer(layout.size);
    this.f32 = new Float32Array(this.bytes);
    this.i32 = new Int32Array(this.bytes);
    this.u32 = new Uint32Array(this.bytes);
  }

  set(name: string, ...values: number[]): this {
    const f = this.layout.byName.get(name);
    if (!f) throw new Error(`no such uniform: ${name}`);
    const width = WIDTH[f.type];
    const stride = f.count > 1 ? roundUp(SIZE[f.type], ALIGN[f.type]) / 4 : width;
    const want = f.count > 1 ? f.count * width : width;
    if (values.length > want) throw new Error(`${name} takes ${want} numbers, got ${values.length}`);
    const target = f.type === 'i32' ? this.i32 : f.type === 'u32' ? this.u32 : this.f32;
    const base = f.offset / 4;
    for (let i = 0; i < values.length; i++) {
      const el = Math.floor(i / width);
      target[base + el * stride + (i % width)] = values[i];
    }
    this.seen.add(name);
    return this;
  }

  /** The same, from an array (a packed list of vec4s, say). */
  setAll(name: string, values: ArrayLike<number>): this {
    return this.set(name, ...Array.from(values));
  }

  /**
   * One element of an array field, leaving the rest alone — for a list built
   * an entry at a time, where `set` would want the whole thing at once.
   */
  setAt(name: string, index: number, ...values: number[]): this {
    const f = this.layout.byName.get(name);
    if (!f) throw new Error(`no such uniform: ${name}`);
    if (index < 0 || index >= f.count) throw new Error(`${name} has ${f.count} elements, asked for ${index}`);
    const width = WIDTH[f.type];
    if (values.length > width) throw new Error(`${name} takes ${width} numbers an element, got ${values.length}`);
    const stride = roundUp(SIZE[f.type], ALIGN[f.type]) / 4;
    const target = f.type === 'i32' ? this.i32 : f.type === 'u32' ? this.u32 : this.f32;
    const base = f.offset / 4 + index * stride;
    for (let i = 0; i < values.length; i++) target[base + i] = values[i];
    this.seen.add(name);
    return this;
  }

  get(name: string): number[] {
    const f = this.layout.byName.get(name);
    if (!f) throw new Error(`no such uniform: ${name}`);
    const width = WIDTH[f.type];
    const stride = f.count > 1 ? roundUp(SIZE[f.type], ALIGN[f.type]) / 4 : width;
    const target = f.type === 'i32' ? this.i32 : f.type === 'u32' ? this.u32 : this.f32;
    const base = f.offset / 4;
    const out: number[] = [];
    for (let el = 0; el < f.count; el++) for (let i = 0; i < width; i++) out.push(target[base + el * stride + i]);
    return out;
  }

  /** Which fields have never been set — a harness's way of finding a forgotten one. */
  unset(): string[] {
    return this.layout.fields.map((f) => f.name).filter((n) => !this.seen.has(n));
  }

  clearSeen(): void { this.seen.clear(); }
}
