const fs = require('fs');
let code = fs.readFileSync('src/gpu/fluid.ts', 'utf8');

const regex = /const species = this\.species && this\.speciesLive && this\.readsSpecies \? this\.species\.read : this\.blank\('rgba'\);\n\s*this\.hsRun\(pass, 'hsPrep', `hsPrep:\$\{this\.vel\.read\.label\}:\$\{mid\.label\}:\$\{this\.squeeze\.read\.label\}:\$\{phase\.label\}:\$\{hand\.label\}:\$\{species\.label\}`,\n\s*this\.arg\('thin prep', \[12 \* nu \/ \(PLATE_METRES \* PLATE_METRES\), seconds, REST_GAP, OPEN_RIM, this\.phaseLive \? \(p\.ferroViscosity \?\? FERRO_NU\) \/ nu : 1,\n\s*NU_REF \/ nu, 0\.25 \* p\.smearX, 0\.25 \* p\.smearY\]\),\n\s*\[this\.vel\.read, prev, mid, this\.squeeze\.read, phase, hand, this\.vel\.write, mob, species\]\);/m;

const replacement = `const species = this.species && this.speciesLive && this.readsSpecies ? this.species.read : this.blank('rgba');
    const film = this.filmLaid > 0 && !!this.film ? this.film.read : this.blank('rgba');
    this.hsRun(pass, 'hsPrep', \`hsPrep:\${this.vel.read.label}:\${mid.label}:\${this.squeeze.read.label}:\${phase.label}:\${hand.label}:\${species.label}:\${film.label}\`,
      this.arg('thin prep', [12 * nu / (PLATE_METRES * PLATE_METRES), seconds, REST_GAP, OPEN_RIM, this.phaseLive ? (p.ferroViscosity ?? FERRO_NU) / nu : 1,
        NU_REF / nu, 0.25 * p.smearX, 0.25 * p.smearY]),
      [this.vel.read, prev, mid, this.squeeze.read, phase, hand, this.vel.write, mob, species, film]);`;

if (regex.test(code)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('src/gpu/fluid.ts', code);
    console.log("Patched fluid.ts successfully.");
} else {
    console.log("Could not match fluid.ts hsPrep call");
}
