import sharp from "sharp";

export function getNextPixelSize(currentSize: number = 0): number {
  const map = new Map([
    [0.125, 0.085],
    [0.085, 0.05],
    [0.05, 0.03],
    [0.03, 0.02],
    [0.02, 0.015],
    [0.015, 0.01],
    [0, 0.125],
  ]);
  return map.get(currentSize) ?? currentSize;
}

export async function pixelate(inputBuffer: Buffer, pixelPercentage: number) {
  const base = sharp(inputBuffer).ensureAlpha();

  const { width, height } = await base.metadata();
  if (!width || !height) throw new Error("Invalid metadata");

  const raw = await base.raw().toBuffer();
  const channels = 4;

  let blockSize = Math.floor(Math.min(width, height) * pixelPercentage);
  if (blockSize < 1) blockSize = 1;

  const output = Buffer.alloc(raw.length);

  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;

      for (let by = y; by < Math.min(y + blockSize, height); by++) {
        for (let bx = x; bx < Math.min(x + blockSize, width); bx++) {
          const i = (by * width + bx) * channels;
          r += raw[i];
          g += raw[i + 1];
          b += raw[i + 2];
          a += raw[i + 3];
          n++;
        }
      }

      const R = (r / n) | 0;
      const G = (g / n) | 0;
      const B = (b / n) | 0;
      const A = (a / n) | 0;

      for (let by = y; by < Math.min(y + blockSize, height); by++) {
        for (let bx = x; bx < Math.min(x + blockSize, width); bx++) {
          const i = (by * width + bx) * channels;
          output[i] = R;
          output[i + 1] = G;
          output[i + 2] = B;
          output[i + 3] = A;
        }
      }
    }
  }

  return sharp(output, { raw: { width, height, channels } }).png().toBuffer();
}
  