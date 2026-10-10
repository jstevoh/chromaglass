import fs from 'fs';
let content = fs.readFileSync('src/presets.ts', 'utf8');
content = content.replace("feature: 'pitchClass'", "feature: 'tonalMid'");
fs.writeFileSync('src/presets.ts', content);
