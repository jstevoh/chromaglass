import re

with open('src/components/LiquidVisualizer.tsx', 'r') as f:
    content = f.read()

# Replace the chemistry block
pattern = r"const chemAmt = Math\.max\(0, Math\.min\(1, currentSettings\.chemistry \?\? 0\)\);\s*const lead = fluidsRef\.current\[0\];\s*if \(chemAmt > 0 && lead && isActiveRef\.current && drainFrameRef\.current === 0\) \{[^\}]+\}[^\}]+\}[^\}]+\}[^\}]+\}[^\}]+\}"

replacement = """const chemAmt = Math.max(0, Math.min(1, currentSettings.chemistry ?? 0));
          const lead = fluidsRef.current[0];
          if (chemAmt > 0 && lead && isActiveRef.current && drainFrameRef.current === 0) {
            const bass01 = currentAudioData ? Math.min(1, currentAudioData.bass / 70) : 0;
            const g = leadGpu;
            if (g && g.stepChemistry) {
              if ((bass01 > 0.5 && DICE.chem.float() < 0.12) || DICE.chem.float() < 0.004) {
                g.seedChemistry(0.15 + DICE.chem.float() * 0.7, 0.15 + DICE.chem.float() * 0.7, 0.01 + DICE.chem.float() * 0.016);
              }
              // The dividing regime grows at a pace a show can watch; coral is slower than a set.
              g.stepChemistry(Math.max(1, Math.min(10, Math.round(sixtieths * 2.5))), 0.042, 0.062);
              const c = harmonyCycle(harmonyRef.current, time * 0.08);
              const amount = chemAmt * 0.02 * sixtieths;
              g.depositChemistry(g.chem.read, amount, [c.r, c.g, c.b], 0.22);
            }
          }"""

new_content = re.sub(pattern, replacement, content, count=1)

# Verify replacement worked
if new_content == content:
    print("No change made to chemistry block!")
    import sys
    sys.exit(1)

new_content = new_content.replace("chemRef.current.reset();", "if (leadGpu && leadGpu.clearChemistry) { leadGpu.clearChemistry(); }")

with open('src/components/LiquidVisualizer.tsx', 'w') as f:
    f.write(new_content)
