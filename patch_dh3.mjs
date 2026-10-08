import fs from 'fs';
let content = fs.readFileSync('src/components/desk/DeskHeader.tsx', 'utf8');

content = content.replace(
  '  onMic?: () => void;\n  onWall?: () => void;\n  /** The controller panel. The dot is the only thing on either desk that names MIDI. */\n  onMidi?: () => void;\n  onPhone?: () => void;\n  /** Start or stop a performance (T). */\n  onPerformance?: () => void;',
  '  onSound?: () => void;\n  onVideo?: () => void;\n  /** The controller panel. The dot is the only thing on either desk that names MIDI. */\n  onMidi?: () => void;'
);

fs.writeFileSync('src/components/desk/DeskHeader.tsx', content);
