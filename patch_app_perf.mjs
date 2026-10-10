import fs from 'fs';

// Patch App.tsx
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(
  '          onMidi={deskOpen.midi}\n          performance={',
  '          onMidi={deskOpen.midi}\n          onPerformance={togglePerformance}\n          performance={'
);
fs.writeFileSync('src/App.tsx', content);

// Patch DesignDesk.tsx props
content = fs.readFileSync('src/components/desk/DesignDesk.tsx', 'utf8');
content = content.replace(
  '  onMidi: () => void;\n  /** The performance',
  '  onMidi: () => void;\n  onPerformance: () => void;\n  /** The performance'
);
fs.writeFileSync('src/components/desk/DesignDesk.tsx', content);

