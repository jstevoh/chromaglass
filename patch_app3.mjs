import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace("cuedRef.current?.kind === 'item'", "cuedRef.current?.item != null");

fs.writeFileSync('src/App.tsx', content);
