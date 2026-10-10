import fs from 'fs';

const path = 'src/presets.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /cometSpeed: 0.8,/,
  `cometSpeed: 0.1,`
);

content = content.replace(
  /{ source: 'sound', feature: 'bass', setting: 'cometSpeed', depth: 0.4 }/,
  `{ source: 'sound', feature: 'bass', setting: 'cometSpeed', depth: 0.2 }`
);

fs.writeFileSync(path, content);
