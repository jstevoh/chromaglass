import re

# 1. Fix fluid.ts
with open('src/gpu/fluid.ts', 'r') as f:
    fluid_code = f.read()
fluid_code = fluid_code.replace("public chemistryLive = false;", "public chemLive = false;")
fluid_code = fluid_code.replace("if (this.chemistryLive) this.carrySubsteps(pass, 'bodyAdvect', this.chem", "if (this.chemLive) this.carrySubsteps(pass, 'bodyAdvect', this.chem")
fluid_code = fluid_code.replace("if (this.chemistryLive) this.macCormack(pass, this.chem", "if (this.chemLive) this.macCormack(pass, this.chem")
fluid_code = fluid_code.replace("if (this.chemistryLive) {", "if (this.chemLive) {")
fluid_code = fluid_code.replace("this.chemistryLive = false;", "this.chemLive = false;")
fluid_code = fluid_code.replace("this.chemistryLive = true;", "this.chemLive = true;")
with open('src/gpu/fluid.ts', 'w') as f:
    f.write(fluid_code)

# 2. Fix fluid.ts WGSL
with open('src/gpu/wgsl/fluid.ts', 'r') as f:
    wgsl_code = f.read()
wgsl_code = wgsl_code.replace("if (p.x == 0 || p.x == S.n - 1 || p.y == 0 || p.y == S.n - 1) {", "if (p.x == 0 || p.x == i32(S.n) - 1 || p.y == 0 || p.y == i32(S.n) - 1) {")
with open('src/gpu/wgsl/fluid.ts', 'w') as f:
    f.write(wgsl_code)

# 3. Fix core.ts (PlateSolver interface)
with open('src/gpu/core.ts', 'r') as f:
    core_code = f.read()

# Add the methods to PlateSolver
# We can just use string replace if we know PlateSolver is there.
if "interface PlateSolver" in core_code:
    # insert methods before the closing brace of PlateSolver
    # Actually wait, PlateSolver has many methods. Let's insert them near clearChemistry
    replacement = """  clearChemistry(): void;
  seedChemistry?(x: number, y: number, radius: number): void;
  stepChemistry?(iters: number, feed?: number, kill?: number): void;
  depositChemistry?(chem: any, amount: number, colour: [number, number, number], threshold?: number): void;
  chem?: any;"""
    core_code = core_code.replace("  clearChemistry(): void;", replacement)
with open('src/gpu/core.ts', 'w') as f:
    f.write(core_code)

# 4. Fix LiquidVisualizer.tsx
with open('src/components/LiquidVisualizer.tsx', 'r') as f:
    lv_code = f.read()

lv_code = lv_code.replace("if (leadGpu && leadGpu.clearChemistry) { leadGpu.clearChemistry(); }", 
    "if (fluidsRef.current[0]?.gpu?.clearChemistry) { fluidsRef.current[0].gpu.clearChemistry(); }")

# Wait, at line 7713, it was `if (leadGpu && leadGpu.clearChemistry)` but maybe leadGpu wasn't defined?
# Wait, at 7713 leadGpu IS defined? Let's check TS errors:
# src/components/LiquidVisualizer.tsx(7706,40): error TS2339: Property 'clearChemistry' does not exist on type 'PlateSolver'.
# Ah! It's because PlateSolver didn't have clearChemistry on the interface, but it DID? Let me check if core.ts has it.

with open('src/components/LiquidVisualizer.tsx', 'w') as f:
    f.write(lv_code)

