---
name: webgpu
description: Render Three.js scenes to images with @drawcall/webgpu in fresh Node.js processes. Use for CPU server-side WebGPU rendering with standard loaders; not for browser WebGPU setup or WebGL migration inside a browser.
---

# Render a scene

Create the canvas before loading assets: its lifetime supplies the image decoder and classic Worker host that standard Three.js loaders need. Import scene classes from `three/webgpu` and loaders from `three/addons`. Keep original assets intact; compressed glTF can use the standard `DRACOLoader` with its decoder directory served over HTTP.

```js
import { createCanvas } from '@drawcall/webgpu';
import { WebGPURenderer } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const canvas = await createCanvas(1280, 720);
const renderer = new WebGPURenderer({ canvas });
const draco = new DRACOLoader().setWorkerLimit(1).setDecoderPath(decoderURL);
try {
  await renderer.init();
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(modelURL);
  renderer.render(gltf.scene, camera);
  const pixels = await canvas.readPixels();
  // Pass pixels to your image encoder before disposing the canvas.
} finally {
  try { draco.dispose(); } finally {
    try { await renderer.dispose(); } finally { await canvas.dispose(); }
  }
}
```

Use HTTP(S) URLs for standard loaders, including assets on a local file server; Node's fetch does not load `file:` URLs. Supply a camera and framing suitable for the scene. Three.js resources created by your application remain yours to dispose; see [Three.js cleanup guidance](https://threejs.org/manual/en/cleanup.html).

Render the final frame to the canvas. If custom passes use render targets, call `renderer.setRenderTarget(null)` before the final canvas render and readback. Dispose the renderer before the canvas; the canvas keeps the native platform alive while renderer resources are released.

This package targets cold rendering: launch a fresh process per task, render, encode, and await disposal. It does not supply a browser DOM, video decoding, 2D canvas, or the complete browser Worker API. Blob image decoding and classic workers support the tested glTF and Draco paths; other loaders may need browser APIs outside this scope. Treat unsupported API errors as compatibility gaps rather than replacing assets or patching Three.js.
