import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(
  '          onMidi={deskOpen.midi}\n          performance={musicIntel.performance.live ? { clock: perfClock ?? \'0:00\', title: musicIntel.performance.live.title } : null}\n          onSearch={() => setShowPalette(true)}',
  '          onMidi={deskOpen.midi}\n          onPerformance={togglePerformance}\n          performance={musicIntel.performance.live ? { clock: perfClock ?? \'0:00\', title: musicIntel.performance.live.title } : null}\n          onSearch={() => setShowPalette(true)}'
);
fs.writeFileSync('src/App.tsx', content);
