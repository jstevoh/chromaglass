import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
/onMic={deskOpen\.mic}\n\s*onWall={deskOpen\.wall}\n\s*onMidi={deskOpen\.midi}\n\s*onPhone={deskOpen\.phone}\n\s*onPerformance={togglePerformance}/g,
`onSound={deskOpen.sound}
          onVideo={deskOpen.video}
          onMidi={deskOpen.midi}`
);

fs.writeFileSync('src/App.tsx', content);
