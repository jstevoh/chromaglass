import fs from 'fs';
let content = fs.readFileSync('PLAN.md', 'utf8');

const newQA = `- **QA-20** Blow amount isn't sensitive enough. At its lowest settings it still blows a ton of ink and creates a lot of bubbles. Needs a gentler bottom end (gentle breeze) and a higher top end (hurricane). This lack of dynamic range may apply to other tools/controls too.`;

content = content.replace("Tier 2. A control does the wrong thing, or cannot be reached.**\n", "Tier 2. A control does the wrong thing, or cannot be reached.**\n\n" + newQA + "\n");
fs.writeFileSync('PLAN.md', content);
