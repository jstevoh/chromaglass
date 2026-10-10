import fs from 'fs';
let content = fs.readFileSync('src/components/desk/PerformDesk.tsx', 'utf8');
content = content.replace(
  '  onMidi: () => void;\n  /** The performance being recorded',
  '  onMidi: () => void;\n  onPerformance: () => void;\n  /** The performance being recorded'
);
fs.writeFileSync('src/components/desk/PerformDesk.tsx', content);
