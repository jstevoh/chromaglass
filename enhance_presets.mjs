import fs from 'fs';

let content = fs.readFileSync('src/presets.ts', 'utf8');

const enhancements = {
  'comet': `
      sceneMappings: [
        { source: 'sound', feature: 'bass', setting: 'cometSpeed', depth: 0.4 },
        { source: 'sound', feature: 'timbre', setting: 'cometAngle', depth: 45 }
      ],`,
  'boiling-point': `
      sceneMappings: [
        { source: 'sound', feature: 'energy', setting: 'airVelocity', depth: 0.05 },
        { source: 'sound', feature: 'treble', setting: 'bubbles', depth: 0.4 }
      ],`,
  'bass-drop': `
      sceneMappings: [
        { source: 'sound', feature: 'kick', setting: 'plateRock', depth: 0.5 },
        { source: 'sound', feature: 'bass', setting: 'gooeyEffect', depth: 0.3 }
      ],`,
  'aurora-borealis': `
      sceneMappings: [
        { source: 'sound', feature: 'note', setting: 'cometSpeed', depth: 0.15 },
        { source: 'sound', feature: 'pitchClass', setting: 'hueJourney', depth: 0.5 }
      ],`,
  'oil-wheel': `
      sceneMappings: [
        { source: 'sound', feature: 'mid', setting: 'rotationSpeed', depth: 0.03 }
      ],`,
  'acid-trip': `
      sceneMappings: [
        { source: 'sound', feature: 'complexity', setting: 'turbulenceScale', depth: 0.25 }
      ],`,
  'microscopic-chaos': `
      sceneMappings: [
        { source: 'sound', feature: 'hats', setting: 'beads', depth: 0.5 }
      ],`,
  'ferro-maze': `
      sceneMappings: [
        { source: 'sound', feature: 'bass', setting: 'magnetStrength', depth: 0.4 }
      ],`
};

for (const [id, mapping] of Object.entries(enhancements)) {
  const regex = new RegExp(`(id:\\s*'${id}'.*?audioMappings:\\s*\\{[^}]+\\},?)`, 's');
  content = content.replace(regex, (match) => {
    return match.replace(/audioMappings:\s*\{/, mapping.trim() + '\n      audioMappings: {');
  });
}

fs.writeFileSync('src/presets.ts', content);
