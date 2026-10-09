const fs = require('fs');
let code = fs.readFileSync('src/gpu/wgsl/fluid.ts', 'utf8');

const str = `  seedChem: \`\${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;
\${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let c = textureLoad(src, p, 0).rg;
  let uv = uvOf(id);
  let d = distance(uv, A.a.xy);
  var un = c.r;
  var vn = c.g;
  if (d <= A.a.z) {
    vn = max(vn, 0.5 + 0.5 * (1.0 - d / A.a.z));
    un = min(un, 0.5);
  }
  textureStore(dst, p, vec4f(un, vn, 0.0, 0.0));
}\`,`;

code = code.replace(/grayScott: /, str + '\n\n  grayScott: ');
fs.writeFileSync('src/gpu/wgsl/fluid.ts', code);
