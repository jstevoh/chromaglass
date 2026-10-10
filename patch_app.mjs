import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

if (!content.includes("import { exportShowKit")) {
  content = content.replace(
    "import { loadSetList",
    "import { exportShowKit, importShowKit, SHOW_KIT_FORMAT } from './lib/showKit';\nimport { loadSetList"
  );
}

// Fix "cues used before declaration"
// Wait, let's find the `cues` error
fs.writeFileSync('src/App.tsx', content);
