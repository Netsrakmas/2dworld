// Seeded value noise with fbm octaves.
function makeNoise(seedInt) {
  const lattice = (x, y) => hash2i(x, y, seedInt) / 4294967296;
  function at(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = lattice(x0, y0), b = lattice(x0 + 1, y0);
    const c = lattice(x0, y0 + 1), d = lattice(x0 + 1, y0 + 1);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  }
  function fbm(x, y, octaves) {
    let v = 0, amp = 0.5, f = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
      v += at(x * f, y * f) * amp;
      total += amp;
      amp *= 0.5; f *= 2;
    }
    return v / total;
  }
  return { at, fbm };
}
