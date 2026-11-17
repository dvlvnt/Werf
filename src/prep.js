// Tablo çizgilerini siler: uzun koyu yatay/dikey çizgileri beyaza boyar.
export function cleanGrid(g, W, H) {
  const out = new Uint8ClampedArray(g);
  const minH = Math.round(W * 0.12);
  const minV = Math.round(H * 0.05);
  for (const thr of [170, 215, 232]) {
    for (let y = 0; y < H; y++) {
      let s = -1;
      for (let x = 0; x <= W; x++) {
        const d = x < W && g[y * W + x] < thr;
        if (d && s < 0) s = x;
        if (!d && s >= 0) {
          if (x - s >= minH) for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) for (let xx = s; xx < x; xx++) out[yy * W + xx] = 255;
          s = -1;
        }
      }
    }
    for (let x = 0; x < W; x++) {
      let s = -1;
      for (let y = 0; y <= H; y++) {
        const d = y < H && g[y * W + x] < thr;
        if (d && s < 0) s = y;
        if (!d && s >= 0) {
          if (y - s >= minV) for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) for (let yy = s; yy < y; yy++) out[yy * W + xx] = 255;
          s = -1;
        }
      }
    }
  }
  // açık gri hücre zeminlerini beyaza çek, yazıyı koyulaştır
  for (let i = 0; i < out.length; i++) {
    const v = out[i];
    out[i] = v > 200 ? 255 : v < 120 ? 0 : Math.round(((v - 120) / 80) * 255);
  }
  return out;
}
