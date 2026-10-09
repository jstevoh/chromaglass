import re

# 3. Fix core.ts (PlateSolver interface)
with open('src/gpu/solverTypes.ts', 'r') as f:
    core_code = f.read()

replacement = """  clearChemistry(): void;
  seedChemistry?(x: number, y: number, radius: number): void;
  stepChemistry?(iters: number, feed?: number, kill?: number): void;
  depositChemistry?(chem: any, amount: number, colour: [number, number, number], threshold?: number): void;
  chem?: any;"""
core_code = core_code.replace("  clearChemistry(): void;", replacement)

with open('src/gpu/solverTypes.ts', 'w') as f:
    f.write(core_code)

# 4. Fix LiquidVisualizer.tsx undefined leadGpu
with open('src/components/LiquidVisualizer.tsx', 'r') as f:
    lv_code = f.read()

# Fix leadGpu usage at line 5470
lv_code = lv_code.replace("if (leadGpu && leadGpu.clearChemistry) { leadGpu.clearChemistry(); }", 
    "if (fluidsRef.current[0]?.gpu?.clearChemistry) { fluidsRef.current[0].gpu.clearChemistry(); }")

with open('src/components/LiquidVisualizer.tsx', 'w') as f:
    f.write(lv_code)

