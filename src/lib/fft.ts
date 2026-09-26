/**
 * One radix-2 FFT for everything in the app that looks at a spectrum offline.
 *
 * There were two copies of this, character for character: one in the local
 * fingerprint and one in the song-map worker. The offline audio analysis
 * (`audioFeatures.ts`, which turns a song file into per-frame bands and onsets
 * for a render) needed a third, and a third copy is how the copies start to
 * drift. So the one that already existed moved here, unchanged, and all three
 * import it. Unchanged matters: the fingerprint index stored in a listener's
 * browser was built with this exact arithmetic, and a "tidier" FFT that
 * rounded differently in the last float bit could move a peak by one bin and
 * quietly stop old fingerprints matching.
 *
 * In place, on Float32Arrays, with the real signal in `re` and zeros in `im`.
 * `re.length` must be a power of two. No allocation, no globals, no clock: the
 * same input gives the same output on every run, which is what lets a song
 * rendered twice come out byte-identical.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe; im[i + k + len / 2] = uIm - vIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}
