import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

const target = `  const cuesRef = useRef<Cue[]>([]);
  useEffect(() => {
    if (cuedRef.current?.kind === 'item') {
      const c = cues.find(x => x.id === cuedRef.current!.item);
      if (c?.missing) setCued(null);
    }
  }, [cues]);`;

content = content.replace(target, "  const cuesRef = useRef<Cue[]>([]);");

const insertTarget = `  const cues = useMemo<Cue[]>(() => {`;
const insertion = `  const cues = useMemo<Cue[]>(() => {`;

content = content.replace(insertTarget, `  useEffect(() => {
    if (cuedRef.current?.kind === 'item') {
      const c = cues.find(x => x.id === cuedRef.current!.item);
      if (c?.missing) setCued(null);
    }
  }, [cues]);

` + insertion);

fs.writeFileSync('src/App.tsx', content);
