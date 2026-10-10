import fs from 'fs';
let content = fs.readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');

// Top performGesture (remote hands):
// const kTool = toolAmountRef.current;
// ->
// const kToolRaw = toolAmountRef.current;
// const kTool = kToolRaw * kToolRaw;
content = content.replace(
  '    const kTool = toolAmountRef.current;\n    const amt = Math.max(0.05, Math.min(1, g.amount ?? 0.5)) * 2 * kTool;',
  '    const kToolRaw = toolAmountRef.current;\n    const kTool = kToolRaw * kToolRaw;\n    const amt = Math.max(0.05, Math.min(1, g.amount ?? 0.5)) * 2 * kTool;'
);

// Lower performGesture loop (mouse):
// const k = toolAmountRef.current;
// ->
// const kRaw = toolAmountRef.current;
// const k = kRaw * kRaw;
content = content.replace(
  `              // The Amount set for this tool (1 is what it always did).\n              const k = toolAmountRef.current;`,
  `              // The Amount set for this tool (1 is what it always did).\n              const kRaw = toolAmountRef.current;\n              const k = kRaw * kRaw;`
);

// Bubble disturbance logic
content = content.replace(
  `if (tool !== 'magnet') bubblesRef.current.disturb(x, y, (tool === 'blow' || tool === 'press' ? 5 : tool === 'spray' ? 6 : 3) * GRID_SCALE, tool === 'blow' || tool === 'press' ? 'air' : 'dye');`,
  `if (tool !== 'magnet') bubblesRef.current.disturb(x, y, (tool === 'blow' || tool === 'press' ? 5 : tool === 'spray' ? 6 : 3) * kSoft * GRID_SCALE, tool === 'blow' || tool === 'press' ? 'air' : 'dye', kSoft);`
);

fs.writeFileSync('src/components/LiquidVisualizer.tsx', content);
