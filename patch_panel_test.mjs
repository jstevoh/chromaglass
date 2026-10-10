import fs from 'fs';
let content = fs.readFileSync('scripts/panel.mjs', 'utf8');

content = content.replace(
  "for (const [dot, handler] of [['mic', 'onMic'], ['wall', 'onWall'], ['midi', 'onMidi'], ['phone', 'onPhone']]) {",
  "for (const [dot, handler] of [['sound', 'onSound'], ['video', 'onVideo'], ['midi', 'onMidi']]) {"
);

fs.writeFileSync('scripts/panel.mjs', content);
