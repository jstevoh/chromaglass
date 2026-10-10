import sys
import re

with open('src/gpu/wgsl/plate.ts', 'r') as f:
    text = f.read()

# 1. decodeFluid
text = re.sub(
    r'fn decodeFluid\(t: texture_2d<f32>, tB: texture_2d<f32>,',
    'fn decodeFluid(t: texture_2d<f32>,',
    text
)
# Remove the unused `let rawB = ...` inside decodeFluid
text = re.sub(
    r'\n\s*let rawB = textureBicubic\(tB, fuv\);',
    '',
    text
)

# 2. decodeFluidRaw
text = re.sub(
    r'fn decodeFluidRaw\(raw: vec4f, rawB: vec4f\)',
    'fn decodeFluidRaw(raw: vec4f)',
    text
)

# 3. decodeFluidDof
text = re.sub(
    r'fn decodeFluidDof\(t: texture_2d<f32>, tB: texture_2d<f32>,',
    'fn decodeFluidDof(t: texture_2d<f32>,',
    text
)
text = re.sub(
    r'if \(dof < 0\.02\) \{ return decodeFluid\(t, tB, fuv, blurFluid, useBlur\); \}',
    'if (dof < 0.02) { return decodeFluid(t, fuv, blurFluid, useBlur); }',
    text
)
text = re.sub(
    r'\n\s*let rawB = \(tex2\(tB, fuv\).*?\* 0\.2;',
    '',
    text
)
text = re.sub(
    r'return decodeFluidRaw\(raw, rawB\);',
    'return decodeFluidRaw(raw);',
    text
)

# 4. decodeFluidParts
text = re.sub(
    r'fn decodeFluidParts\(t: texture_2d<f32>, tB: texture_2d<f32>,',
    'fn decodeFluidParts(t: texture_2d<f32>,',
    text
)
text = re.sub(
    r'if \(U\.particles <= 0\.001\) \{ return decodeFluidDof\(t, tB, fuv, blurFluid, useBlur, dof\); \}',
    'if (U.particles <= 0.001) { return decodeFluidDof(t, fuv, blurFluid, useBlur, dof); }',
    text
)
text = re.sub(
    r'\s*var rawB: vec4f;\n',
    '\n',
    text
)

# 5. The calls to decodeFluidParts
text = re.sub(
    r'decodeFluidParts\(layer0, layer0B, parts0,',
    'decodeFluidParts(layer0, parts0,',
    text
)
text = re.sub(
    r'decodeFluidParts\(layer1, layer1B, parts1,',
    'decodeFluidParts(layer1, parts1,',
    text
)

with open('src/gpu/wgsl/plate.ts', 'w') as f:
    f.write(text)

print("Done")
