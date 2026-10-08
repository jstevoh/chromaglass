import fs from 'fs';

let content = fs.readFileSync('src/presets.ts', 'utf8');

// Lower beatSqueeze across all presets. 
// A lot of them are 0.3-0.9. We will scale them down by 0.25, cap at 0.2
content = content.replace(/beatSqueeze:\s*([0-9.]+)/g, (match, val) => {
  let v = parseFloat(val);
  v = Math.min(0.2, v * 0.25);
  return `beatSqueeze: ${v.toFixed(2)}`;
});

// Write it out
fs.writeFileSync('src/presets.ts', content);
