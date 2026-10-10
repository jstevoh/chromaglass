import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

const effect = `  useEffect(() => {
    if (cuedRef.current?.item != null) {
      const c = cues.find(x => x.id === cuedRef.current!.item);
      if (c?.missing) setCued(null);
    }
  }, [cues]);\n\n`;

content = content.replace(effect, "");

const cuesEnd = `    return flat;
  }, [list, sequencer.sequences]);`;

content = content.replace(cuesEnd, cuesEnd + "\n\n" + effect);

content = content.replace(/res\.userPresets/g, "res.presets");

fs.writeFileSync('src/App.tsx', content);
