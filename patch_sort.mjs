import fs from 'fs';
let content = fs.readFileSync('src/lib/audioFeatures.ts', 'utf8');

const replacement = `      for (let i = 0; i < 15; i++) {
        vals[i] = this.specRing[i][k];
      }
      // Insertion sort is much faster for 15 elements than V8's typed array sort overhead
      for (let i = 1; i < 15; i++) {
        const v = vals[i];
        let j = i - 1;
        while (j >= 0 && vals[j] > v) {
          vals[j + 1] = vals[j];
          j--;
        }
        vals[j + 1] = v;
      }
      const median = vals[7];`;

content = content.replace(
  /for \(let i = 0; i < 15; i\+\+\) \{\s*vals\[i\] = this\.specRing\[i\]\[k\];\s*\}\s*vals\.sort\(\);\s*const median = vals\[7\];/,
  replacement
);

fs.writeFileSync('src/lib/audioFeatures.ts', content);
