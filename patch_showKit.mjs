import fs from 'fs';
let content = fs.readFileSync('src/lib/showKit.ts', 'utf8');
content = content.replace(
  "type SongMap, type TrackEvolutionState, type SavedPerformance, type TrackFingerprint",
  "type SongMap, type TrackEvolutionState, type SavedPerformance"
);
content = content.replace(
  "} from './musicTypes';",
  "} from './musicTypes';\nimport { type TrackFingerprint } from './localFingerprint';"
);
fs.writeFileSync('src/lib/showKit.ts', content);
