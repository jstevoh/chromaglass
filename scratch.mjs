import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

const importShowKitSrc = `import { exportShowKit, importShowKit, SHOW_KIT_FORMAT } from './lib/showKit';`;
if (!content.includes('importShowKit')) {
  content = content.replace("import { loadSavedSets, ", importShowKitSrc + "\nimport { loadSavedSets, ");
}

const actionSrc = `    else if (a === 'export-show') {
      const list = setListRef.current;
      exportShowKit(list, userPresetsRef.current, sequencer.sequences).then(text => {
        downloadText(\`\${list.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'show'}.chromaglass-show.json\`, text);
      });
    } else if (a === 'import-show') {
      const el = document.createElement('input');
      el.type = 'file';
      el.accept = '.json';
      el.onchange = async () => {
        const file = el.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          await importShowKit(text, (res) => {
            if (res.list) {
              changeSet(res.list);
              setLiveItemId(null);
            }
            if (res.userPresets && res.userPresets.length) { for (const p of res.userPresets) userPresets.upsert(p); }
            if (res.sequences && res.sequences.length) { for (const q of res.sequences) sequencer.upsertSequence(q); }
          });
          alert('Show kit imported! Reloading the page to apply MIDI map, liquids, and wall configurations.');
          window.location.reload();
        } catch (err) {
          alert('Failed to import show kit: ' + (err instanceof Error ? err.message : String(err)));
        }
      };
      el.click();
    }`;

content = content.replace("else if (a === 'clear') {", actionSrc + "\n    else if (a === 'clear') {");
fs.writeFileSync('src/App.tsx', content);
