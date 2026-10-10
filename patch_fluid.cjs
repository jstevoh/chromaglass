const fs = require('fs');
let code = fs.readFileSync('src/gpu/fluid.ts', 'utf8');

// Add chem pingpong
code = code.replace(/private readonly dye: PingPong;/, `private readonly dye: PingPong;
  private readonly chem: PingPong;
  public chemistryLive = false;`);

// Add to constructor
code = code.replace(/this\.dye = pp\(this\.N, this\.dyeFormat, 'dye'\);/, `this.dye = pp(this.N, this.dyeFormat, 'dye');
    this.chem = pp(this.N, 'rgba16float', 'chem');`);

// Add pipeline preparation
code = code.replace(/\['depositChem', \[dye, RGBA32\], true\],/, `['depositChem', [dye, RGBA32], true],
      ['grayScott', [RGBA16FLOAT], true],`);

// Add clearChemistry logic
code = code.replace(/if \(this\.mix\) for \\(const t of \\\[this\.mix\.a, this\.mix\.b\\\]\\) this\.fill\\(pass, t, \\\[0, 0, 0, 0\\\], this\.N\\);/, 
  `if (this.mix) for (const t of [this.mix.a, this.mix.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
    if (this.chem) for (const t of [this.chem.a, this.chem.b]) this.fill(pass, t, [1, 0, 0, 0], this.N);
    this.chemistryLive = false;`);

fs.writeFileSync('src/gpu/fluid.ts', code);
