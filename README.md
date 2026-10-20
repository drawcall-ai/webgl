# @drawcall/webgpu

Render Three.js scenes in a fresh Node.js process on CPU-only Linux x64 VMs, using native WebGPU. Three.js and original assets stay unchanged.

```js
import { createCanvas } from '@drawcall/webgpu';
import { WebGPURenderer } from 'three/webgpu';
import sharp from 'sharp';

const canvas = await createCanvas(1280, 720);
const renderer = new WebGPURenderer({ canvas, antialias: false, alpha: false });
try {
  await renderer.init();
  // Build or load your scene with three/webgpu and standard Three.js loaders.
  renderer.render(scene, camera);
  await sharp(await canvas.readPixels(), {
    raw: { width: 1280, height: 720, channels: 4 },
  }).png().toFile('frame.png');
} finally {
  try { await renderer.dispose(); } finally { await canvas.dispose(); }
}
```

Requires Node.js 24 and Linux x64 with `libvulkan1`, `libdrm2`, `zlib1g`, `libzstd1`, and `libudev1` installed. Currently validated on Debian 13; this is a local, unpublished package. This is not a browser: DOM, video, and canvas-2D texture sources are unsupported. See the shipped [usage skill](skills/webgpu/SKILL.md) for loading scenes and resource ownership.

From a source checkout, `npm run build:native` builds on Modal; `npm run test:cloud` installs and validates the packed packages on a small Modal VM. Both require an authenticated Modal CLI.
