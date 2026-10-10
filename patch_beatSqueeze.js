import fs from 'fs';

const path = 'src/presets.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/beatSqueeze: ([\d.]+)/g, (match, val) => {
  const num = parseFloat(val);
  const newNum = Math.max(0.01, parseFloat((num / 2).toFixed(2)));
  return `beatSqueeze: ${newNum}`;
});

fs.writeFileSync(path, content);
