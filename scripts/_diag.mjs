import { analysePcm } from '../src/lib/audioFeatures.ts';
import { SongShape } from '../src/lib/songShape.ts';
import { arrange, SR } from './arrangement.mjs';
const [a, b] = process.argv.slice(2).map(Number);
const song = arrange({ bpm: 100, sections: [{ kind: 'verse', bars: 64 }], style: 'band', seed: 7 });
console.log('fills', song.truth.fills.filter(f => f > a && f < b).map(f => f.toFixed(1)).join(' '));
const rs = analysePcm(song.pcm, SR, 60);
const sh = new SongShape();
let lastN = 0;
for (const r of rs) { const ev = sh.update(r, r.time); const x = sh;
  if (r.time > a && r.time < b && x.tH.length !== lastN) { const n = x.tH.length; const top = x.topH[n-1];
    console.log(r.time.toFixed(2), 'top', top.toFixed(1), 'act', x.now.action.toFixed(2), 'climb', x.climbingFor.toFixed(1), 'low', x.lowH[n-1].toFixed(1), x.now.section, ev.map(e=>e.kind).join()); }
  lastN = x.tH.length; }
