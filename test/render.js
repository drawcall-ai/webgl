import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createCanvas } from '@drawcall/webgpu';
import { WebGPURenderer } from 'three/webgpu';
import { buildScene, WIDTH, HEIGHT } from './scenes.js';
import { serve } from './server.js';

const [name, output] = process.argv.slice(2);
const server = await serve();
let canvas, renderer;
let hash;
try {
  canvas = await createCanvas(WIDTH, HEIGHT);
  renderer = new WebGPURenderer({ canvas, antialias: false, alpha: false });
  await renderer.init();
  renderer.shadowMap.enabled = name === 'soldier';
  const { scene, camera } = await buildScene(name, renderer, server.url, WIDTH / HEIGHT);
  renderer.render(scene, camera);
  const pixels = await canvas.readPixels();
  await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toFile(output);
  hash = createHash('sha256').update(pixels).digest('hex');
} finally {
  try { await renderer?.dispose(); } finally {
    try { await canvas?.dispose(); } finally { await server.close(); }
  }
}
const peakRssKiB = process.resourceUsage().maxRSS;
console.log(JSON.stringify({ scene: name, hash, peakRssMiB: peakRssKiB > 0 ? peakRssKiB / 1024 : null }));
