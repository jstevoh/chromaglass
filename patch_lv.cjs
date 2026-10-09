const fs = require('fs');
let code = fs.readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');

const regex = /const chemAmt = Math\.max\(0, Math\.min\(1, currentSettings\.chemistry \?\? 0\)\);[\s\S]*?\}[\s\S]*?\}/;
const newCode = `const chemAmt = Math.max(0, Math.min(1, currentSettings.chemistry ?? 0));
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
          }
        }`;
code = code.replace(regex, newCode);

code = code.replace(/chemRef\.current\.reset\(\);/g, `if (leadGpu && leadGpu.clearChemistry) { leadGpu.clearChemistry(); }`);

// Note: chemRef is also returned in qa diagnostics, we can leave it returning the old unused object or null.
fs.writeFileSync('src/components/LiquidVisualizer.tsx', code);
