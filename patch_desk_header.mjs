import fs from 'fs';
let content = fs.readFileSync('src/components/desk/DeskHeader.tsx', 'utf8');

content = content.replace('mic: boolean;', 'sound: boolean;');
content = content.replace('wall: boolean;', 'video: boolean;');
content = content.replace(/phone: boolean;\s+rec: string \| null;\s+\/\*\*.*?\*\/\s+perf: string \| null;/, '');

content = content.replace('onMic, onWall, onMidi, onPhone, onPerformance,', 'onSound, onVideo, onMidi,');

content = content.replace('onMic: () => void;\n  onWall: () => void;\n  onMidi: () => void;\n  onPhone: () => void;\n  onPerformance: () => void;', 'onSound: () => void;\n  onVideo: () => void;\n  onMidi: () => void;');

const searchDotMic = /<StatusDot\s+on=\{dots\.mic\}.*?testId="dot-mic"\s+\/>/s;
content = content.replace(searchDotMic, `<StatusDot
          on={dots.sound}
          label="Sound" tight={tight}
          onClick={onSound}
          title={dots.sound ? 'Sound is coming in — click to choose the input' : 'Nothing is listening. Click to pick a microphone or another source.'}
          testId="dot-sound"
        />`);

const searchDotWall = /<StatusDot\s+on=\{dots\.wall\}.*?testId="dot-wall"\s+\/>/s;
content = content.replace(searchDotWall, `<StatusDot
          on={dots.video}
          label="Video" tight={tight}
          onClick={onVideo}
          title={dots.video ? 'On a wall — click for the output controls' : 'Not on a wall. Click for the projector and output controls.'}
          testId="dot-video"
        />`);

const searchDotPhone = /<StatusDot\s+on=\{dots\.phone\}.*?testId="dot-phone"\s+\/>/s;
content = content.replace(searchDotPhone, '');

const searchDotRec = /\{dots\.rec && <StatusDot on tone="live" label={`Rec \$\{dots\.rec\}`} short="Rec" tight=\{tight\} testId="dot-rec" \/>\}/s;
content = content.replace(searchDotRec, '');

const searchDotPerf = /{\/\*[\s\S]*?\*\/}\s+<StatusDot\s+on=\{!!dots\.perf\}[\s\S]*?testId="dot-performance"\s+\/>/s;
content = content.replace(searchDotPerf, '');

fs.writeFileSync('src/components/desk/DeskHeader.tsx', content);
