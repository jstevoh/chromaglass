import re

with open('src/components/LiquidVisualizer.tsx', 'r') as f:
    code = f.read()

pattern = r"g\.stepChemistry\(Math\.max\(1, Math\.min\(10, Math\.round\(sixtieths \* 2\.5\)\)\), 0\.042, 0\.062\);"
replacement = """const p = currentSettings.chemistryPattern ?? 0;
              const feed = 0.03 + p * 0.01;
              const kill = 0.055 + p * 0.005;
              const w = Math.pow(2, ((currentSettings.chemistryWidth ?? 0.5) - 0.5) * 4);
              if (g.chemBase) {
                // Not supported on old interface, but our PlateSolver doesn't have Du/Dv param yet
                // We will add Du/Dv param to stepChemistry in a moment.
              }
              g.stepChemistry(Math.max(1, Math.min(10, Math.round(sixtieths * 2.5))), feed, kill);"""
# wait, stepChemistry signature needs Du/Dv!
