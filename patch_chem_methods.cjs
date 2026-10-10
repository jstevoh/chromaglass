const fs = require('fs');
let code = fs.readFileSync('src/gpu/fluid.ts', 'utf8');

code = code.replace(/depositChemistry\(chem: GPUTexture, amount: number, colour: \\\[number, number, number\\\], threshold = 0.22\): void \{/, 
  `seedChemistry(x: number, y: number, radius: number): void {
    const enc = this.device.createCommandEncoder({ label: 'seed chemistry' });
    const pass = enc.beginComputePass();
    this.run(pass, 'seedChem', this.chem.write, [this.chem.read], this.arg('seed', [x, y, radius, 0, 0, 0, 0, 0]));
    this.chem.swap();
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.chemistryLive = true;
  }

  stepChemistry(iters: number, feed = 0.042, kill = 0.062): void {
    if (iters <= 0 || !this.chemistryLive) return;
    const enc = this.device.createCommandEncoder({ label: 'step chemistry' });
    const pass = enc.beginComputePass();
    for (let i = 0; i < iters; i++) {
      this.run(pass, 'grayScott', this.chem.write, [this.chem.read], this.arg('chem', [0.16, 0.08, feed, kill, 0, 0, 0, 0]));
      this.chem.swap();
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  depositChemistry(chem: GPUTexture, amount: number, colour: [number, number, number], threshold = 0.22): void {`);

code = code.replace(/\['grayScott', \\['rgba16float'\\], true\\],/, 
  `['grayScott', ['rgba16float'], true],
      ['seedChem', ['rgba16float'], true],`);

fs.writeFileSync('src/gpu/fluid.ts', code);
