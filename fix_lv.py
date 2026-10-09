import re

with open('src/components/LiquidVisualizer.tsx', 'r') as f:
    lv_code = f.read()

lv_code = lv_code.replace("if (fluidsRef.current[0]?.gpu?.clearChemistry) { fluidsRef.current[0].gpu.clearChemistry(); }", 
    "fluidsRef.current[0]?.gpu?.clearChemistry?.();")

lv_code = lv_code.replace("g.seedChemistry(", "g.seedChemistry?.(")
lv_code = lv_code.replace("g.stepChemistry(", "g.stepChemistry?.(")
lv_code = lv_code.replace("g.depositChemistry(", "g.depositChemistry?.(")

lv_code = lv_code.replace("if (leadGpu && leadGpu.clearChemistry) { leadGpu.clearChemistry(); }", "leadGpu?.clearChemistry?.();")

with open('src/components/LiquidVisualizer.tsx', 'w') as f:
    f.write(lv_code)
