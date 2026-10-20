import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WIDTH, HEIGHT } from './scenes.js';

const [name, path, expectedHash] = process.argv.slice(2);
const actual = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.equal(actual.info.width, WIDTH);
assert.equal(actual.info.height, HEIGHT);
assert.equal(createHash('sha256').update(actual.data).digest('hex'), expectedHash);
const reference = await sharp(fileURLToPath(new URL(`reference/${name}.png`, import.meta.url))).ensureAlpha().raw().toBuffer();
assert.equal(actual.data.length, reference.length);
let total = 0, above8 = 0;
for (let i = 0; i < reference.length; i += 4) {
  assert.equal(actual.data[i + 3], 255, `Non-opaque pixel at ${i / 4}`);
  let maximum = 0;
  for (let channel = 0; channel < 3; channel++) {
    const error = Math.abs(actual.data[i + channel] - reference[i + channel]);
    total += error;
    maximum = Math.max(maximum, error);
  }
  if (maximum > 8) above8++;
}
const meanAbsoluteRgbError = total / (WIDTH * HEIGHT * 3);
const differingPixelShare = above8 / (WIDTH * HEIGHT);
// Browser/backend rounding and edge rasterization differ; large texture corruption must fail.
assert.ok(meanAbsoluteRgbError < 0.5, `RGB error ${meanAbsoluteRgbError}`);
assert.ok(differingPixelShare < 0.005, `Differing pixels ${differingPixelShare}`);
console.log(JSON.stringify({ meanAbsoluteRgbError, differingPixelShare }));
