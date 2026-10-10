import fs from 'fs';
let code = fs.readFileSync('scripts/bubbles.mjs', 'utf8');

code = code.replace(
  `        const mean = (xs) => xs.reduce((t, q) => t + q[1], 0) / xs.length;
        // The half it barely lit is the rim; the half it lit hardest is the core.
        return { satLost: mean(byGain.slice(0, half)), satCore: mean(byGain.slice(half)) };
      })(), hueShift: hueWeight ? hueShift / hueWeight : 0, lumGain: n ? lumGain / n : 0,
      worstSat, worstHue };`,
  `        const mean = (xs) => xs.reduce((t, q) => t + q[1], 0) / xs.length;
        // The half it barely lit is the rim; the half it lit hardest is the core.
        return { satLost: mean(byGain.slice(0, half)), satCore: mean(byGain.slice(half)) };
      })(), hueShift: hueWeight ? hueShift / hueWeight : 0, lumGain: n ? lumGain / n : 0,
      worstSat, worstHue, debugPairs: pairs.slice(0, 10) };`
);

code = code.replace(
  `    console.log(\`     and it is brighter, as a lens should be: \${Math.round(report.lumGain * 100)}% more light\`);`,
  `    console.log(\`     and it is brighter, as a lens should be: \${Math.round(report.lumGain * 100)}% more light\`);
    console.log('DEBUG PAIRS (gndLum, bubLum - gndLum):', report.debugPairs);`
);

fs.writeFileSync('scripts/bubbles.mjs', code);
