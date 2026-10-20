# @drawcall/webgpu

Render Three.js scenes in a fresh Node.js process on the CPU, using native WebGPU. Three.js and original assets stay unchanged.

```js
import { createCanvas } from '@drawcall/webgpu';
import { WebGPURenderer } from 'three/webgpu';
import sharp from 'sharp';

const canvas = await createCanvas(1280, 720);
const renderer = new WebGPURenderer({ canvas });
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

Requires Node.js 22+. Native packages bundle the software renderer and Vulkan loader for Linux x64/ARM64 (glibc 2.28+), macOS Intel/Apple Silicon, and Windows x64. No GPU, browser, compiler, SDK, or system graphics packages are needed. Keep npm optional dependencies enabled. Alpine/musl and other platform/CPU combinations are unsupported.

This package is currently unpublished. The example uses `three` and `sharp` as application dependencies. DOM, video, and canvas-2D texture sources are unsupported. See the shipped [usage skill](skills/webgpu/SKILL.md) for loading scenes and resource ownership.

CI builds and tests each platform's packages. From a source checkout, `npm run build:native` builds Linux x64 on Modal; `npm run test:cloud` validates packed packages on a small Modal VM. Both require an authenticated Modal CLI.
