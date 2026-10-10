import fs from 'fs';

let content = fs.readFileSync('src/presets.ts', 'utf8');

const enhancements = {
  'cell-bloom': `
      sceneMappings: [
        { source: 'sound', feature: 'mid', setting: 'beads', depth: 0.3 }
      ],`,
  'milk-marble': `
      sceneMappings: [
        { source: 'sound', feature: 'bass', setting: 'beads', depth: 0.2 },
        { source: 'sound', feature: 'treble', setting: 'airVelocity', depth: 0.02 }
      ],`,
  'soap-film': `
      sceneMappings: [
        { source: 'sound', feature: 'energy', setting: 'beads', depth: 0.15 }
      ],`,
  'aurora-borealis': `
      sceneMappings: [
        { source: 'sound', feature: 'note', setting: 'cometSpeed', depth: 0.15 },
        { source: 'sound', feature: 'tonalMid', setting: 'cometAngle', depth: 45 }
      ],`
};

for (const [id, mapping] of Object.entries(enhancements)) {
  const regex = new RegExp(`(id:\\s*'${id}'.*?audioMappings:\\s*\\{[^}]+\\},?)`, 's');
  content = content.replace(regex, (match) => {
    // only if it doesn't already have sceneMappings
    if (match.includes('sceneMappings')) return match;
    return match.replace(/audioMappings:\s*\{/, mapping.trim() + '\n      audioMappings: {');
  });
}

fs.writeFileSync('src/presets.ts', content);
