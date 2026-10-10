import fs from 'fs';
let content = fs.readFileSync('src/lib/toolAmount.ts', 'utf8');
content = content.replace(
  'export const TOOL_AMOUNT = { min: 0.1, max: 3, step: 0.05 } as const;',
  'export const TOOL_AMOUNT = { min: 0.05, max: 5, step: 0.05 } as const;'
);
fs.writeFileSync('src/lib/toolAmount.ts', content);
