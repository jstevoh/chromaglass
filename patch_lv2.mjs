import fs from 'fs';
let content = fs.readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');

content = content.replace(
  `    if (layer === 0 && (settingsRef.current.bubbles ?? 0) > 0) {
      const airy = g.tool === 'blow' || g.tool === 'press';
      bubblesRef.current.disturb(g.x * GRID_SIZE, g.y * GRID_SIZE, (airy ? 5 : 3) * GRID_SCALE, airy ? 'air' : 'dye');
    }
    const S = GRID_SIZE;`,
  `    const S = GRID_SIZE;
    const kToolRaw = toolAmountRef.current;
    const kTool = kToolRaw * kToolRaw;
    const kSoftTool = Math.sqrt(kTool);
    if (layer === 0 && (settingsRef.current.bubbles ?? 0) > 0) {
      const airy = g.tool === 'blow' || g.tool === 'press';
      bubblesRef.current.disturb(g.x * GRID_SIZE, g.y * GRID_SIZE, (airy ? 5 : 3) * kSoftTool * GRID_SCALE, airy ? 'air' : 'dye', kSoftTool);
    }`
);

content = content.replace(
  `    const kToolRaw = toolAmountRef.current;
    const kTool = kToolRaw * kToolRaw;
    const amt = Math.max(0.05, Math.min(1, g.amount ?? 0.5)) * 2 * kTool;`,
  `    const amt = Math.max(0.05, Math.min(1, g.amount ?? 0.5)) * 2 * kTool;`
);

fs.writeFileSync('src/components/LiquidVisualizer.tsx', content);
