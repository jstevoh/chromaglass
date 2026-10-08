const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const importShowKitSrc = `import { exportShowKit, importShowKit, SHOW_KIT_FORMAT } from './lib/showKit';`;
if (!content.includes('importShowKit')) {
  content = content.replace("import { loadSavedSets, ", importShowKitSrc + "\nimport { loadSavedSets, ");
}

const actionSrc = `    else if (a === 'export-show') {
      const list = setListRef.current;
      exportShowKit(list, userPresetsRef.current, sequencerRef.current?.sequences ?? []).then(text => {
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
            if (res.userPresets.length) changeUserPresets(res.userPresets);
            if (res.sequences.length) sequencerRef.current?.importSequences(res.sequences);
          });
          // After import, we might want to refresh settings, but mostly React handles state if it reads from refs/state.
          // Wait, the outputs and midi maps are loaded from localStorage by the hooks...
          // We might need to force reload the page or trigger a refresh!
          alert('Show kit imported! Reload the page to apply MIDI map, liquids, and wall configurations.');
          window.location.reload();
        } catch (err: any) {
          alert('Failed to import show kit: ' + err.message);
        }
      };
      el.click();
    }`;

content = content.replace("else if (a === 'clear') {", actionSrc + "\n    else if (a === 'clear') {");
fs.writeFileSync('src/App.tsx', content);
