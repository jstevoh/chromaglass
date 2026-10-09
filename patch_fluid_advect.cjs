const fs = require('fs');
let code = fs.readFileSync('src/gpu/fluid.ts', 'utf8');

// Advect when !bodiesOn && thin
code = code.replace(/this\.carrySubsteps\(pass, 'bodyAdvect', this\.liquids1, this\.arg\('body advect thin', \[0, 0, 0, 0, 0, disp, 1, REST_GAP\]\)\);/,
  `this.carrySubsteps(pass, 'bodyAdvect', this.liquids1, this.arg('body advect thin', [0, 0, 0, 0, 0, disp, 1, REST_GAP]));
        if (this.chemistryLive) this.carrySubsteps(pass, 'bodyAdvect', this.chem, this.arg('body advect thin', [0, 0, 0, 0, 0, disp, 1, REST_GAP]));`);

// Advect when !bodiesOn
code = code.replace(/this\.macCormack\(pass, this\.liquids1, this\.velForced, disp, 'dye'\);/,
  `this.macCormack(pass, this.liquids1, this.velForced, disp, 'dye');
        if (this.chemistryLive) this.macCormack(pass, this.chem, this.velForced, disp, 'dye');`);

// Advect when thin (with bodiesOn)
code = code.replace(/this\.carrySubsteps\(pass, 'bodyAdvect', this\.liquids1, thinAdv\);/,
  `this.carrySubsteps(pass, 'bodyAdvect', this.liquids1, thinAdv);
        if (this.chemistryLive) this.carrySubsteps(pass, 'bodyAdvect', this.chem, thinAdv);`);

// Advect when bodiesOn && !thin
code = code.replace(/this\.runPressed\(pass, 'bodyAdvect', this\.liquids1\.write, \[this\.liquids1\.read, this\.velForced\], adv\);\n\s*this\.liquids1\.swap\(\);/,
  `this.runPressed(pass, 'bodyAdvect', this.liquids1.write, [this.liquids1.read, this.velForced], adv);
      this.liquids1.swap();
      if (this.chemistryLive) {
        this.runPressed(pass, 'bodyAdvect', this.chem.write, [this.chem.read, this.velForced], adv);
        this.chem.swap();
      }`);

fs.writeFileSync('src/gpu/fluid.ts', code);
