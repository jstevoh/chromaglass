const fs = require('fs');
let code = fs.readFileSync('src/gpu/wgsl/fluid.ts', 'utf8');

// replace the wrongly added lines
const wrongText = `  grayScott: \`\${HEAD}\`
\`@group(0) @binding(2) var src: texture_2d<f32>;\`
\`@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;\`
\`\${W} fn main(@builtin(global_invocation_id) id: vec3u) {\`
\`  if (!inGrid(id)) { return; }\`
\`  let p = vec2i(id.xy);\`
\`  if (p.x == 0 || p.x == S.n - 1 || p.y == 0 || p.y == S.n - 1) {\`
\`    textureStore(dst, p, vec4f(1.0, 0.0, 0.0, 0.0));\`
\`    return;\`
\`  }\`
\`  let c = textureLoad(src, p, 0).rg;\`
\`  let l = textureLoad(src, p - vec2i(1, 0), 0).rg\`
\`        + textureLoad(src, p + vec2i(1, 0), 0).rg\`
\`        + textureLoad(src, p - vec2i(0, 1), 0).rg\`
\`        + textureLoad(src, p + vec2i(0, 1), 0).rg\`
\`        - 4.0 * c;\`
\`  let uvv = c.r * c.g * c.g;\`
\`  let un = c.r + A.a.x * l.r - uvv + A.a.z * (1.0 - c.r);\`
\`  let vn = c.g + A.a.y * l.g + uvv - (A.a.z + A.a.w) * c.g;\`
\`  textureStore(dst, p, vec4f(clamp(un, 0.0, 1.0), clamp(vn, 0.0, 1.0), 0.0, 0.0));\`
\`}\`,`;

const rightText = `  grayScott: \`\${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;
\${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  if (p.x == 0 || p.x == S.n - 1 || p.y == 0 || p.y == S.n - 1) {
    textureStore(dst, p, vec4f(1.0, 0.0, 0.0, 0.0));
    return;
  }
  let c = textureLoad(src, p, 0).rg;
  let l = textureLoad(src, p - vec2i(1, 0), 0).rg
        + textureLoad(src, p + vec2i(1, 0), 0).rg
        + textureLoad(src, p - vec2i(0, 1), 0).rg
        + textureLoad(src, p + vec2i(0, 1), 0).rg
        - 4.0 * c;
  let uvv = c.r * c.g * c.g;
  let un = c.r + A.a.x * l.r - uvv + A.a.z * (1.0 - c.r);
  let vn = c.g + A.a.y * l.g + uvv - (A.a.z + A.a.w) * c.g;
  textureStore(dst, p, vec4f(clamp(un, 0.0, 1.0), clamp(vn, 0.0, 1.0), 0.0, 0.0));
}\`,`;

code = code.replace(wrongText, rightText);
fs.writeFileSync('src/gpu/wgsl/fluid.ts', code);
