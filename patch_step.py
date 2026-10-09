import re

# 1. solverTypes.ts
with open('src/gpu/solverTypes.ts', 'r') as f:
    code = f.read()
code = code.replace("stepChemistry?(iters: number, feed?: number, kill?: number): void;", "stepChemistry?(iters: number, feed?: number, kill?: number, Du?: number, Dv?: number): void;")
with open('src/gpu/solverTypes.ts', 'w') as f:
    f.write(code)

# 2. fluid.ts
with open('src/gpu/fluid.ts', 'r') as f:
    code = f.read()
code = code.replace("stepChemistry(iters: number, feed = 0.042, kill = 0.062): void {", "stepChemistry(iters: number, feed = 0.042, kill = 0.062, Du = 0.16, Dv = 0.08): void {")
code = code.replace("this.arg('chem', [0.16, 0.08, feed, kill, 0, 0, 0, 0])", "this.arg('chem', [Du, Dv, feed, kill, 0, 0, 0, 0])")
with open('src/gpu/fluid.ts', 'w') as f:
    f.write(code)

# 3. LiquidVisualizer.tsx
with open('src/components/LiquidVisualizer.tsx', 'r') as f:
    code = f.read()
pattern = r"g\.stepChemistry\?\.([^;]+);"
replacement = """const p = currentSettings.chemistryPattern ?? 0;
              const feed = 0.03 + p * 0.01;
              const kill = 0.055 + p * 0.005;
              const w = Math.pow(2, ((currentSettings.chemistryWidth ?? 0.5) - 0.5) * 4);
              g.stepChemistry?.(Math.max(1, Math.min(10, Math.round(sixtieths * 2.5))), feed, kill, 0.16 * w, 0.08 * w);"""
code = re.sub(pattern, replacement, code)
with open('src/components/LiquidVisualizer.tsx', 'w') as f:
    f.write(code)
