import fs from 'fs';
let content = fs.readFileSync('src/components/desk/PerformDesk.tsx', 'utf8');

content = content.replace('onMic: () => void;\n  onWall: () => void;\n  onMidi: () => void;\n  onPhone: () => void;\n  onPerformance: () => void;', 'onSound: () => void;\n  onVideo: () => void;\n  onMidi: () => void;');

content = content.replace('onMic={p.onMic}\n        onWall={p.onWall}\n        onMidi={p.onMidi}\n        onPhone={p.onPhone}\n        onPerformance={p.onPerformance}', 'onSound={p.onSound}\n        onVideo={p.onVideo}\n        onMidi={p.onMidi}');

fs.writeFileSync('src/components/desk/PerformDesk.tsx', content);
