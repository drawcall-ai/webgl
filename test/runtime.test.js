import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanvas } from '@drawcall/webgpu';
import { Color, Scene, PerspectiveCamera, WebGPURenderer } from 'three/webgpu';

test('canvas restores globals, rejects overlap, and packs unaligned readback rows', async () => {
  const names = ['navigator', 'ImageBitmap', 'createImageBitmap', 'Worker', 'self', 'ProgressEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'GPUTextureUsage'];
  const environment = { ...process.env };
  const before = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  await assert.rejects(createCanvas(0, 2));
  for (let iteration = 0; iteration < 2; iteration++) {
    const canvas = await createCanvas(2, 2);
    const renderer = new WebGPURenderer({ canvas, antialias: false, alpha: false });
    try {
      await assert.rejects(createCanvas(2, 2));
      await renderer.init();
      await assert.rejects(canvas.readPixels(), /Render a frame/);
      const scene = new Scene();
      scene.background = new Color(0xff0000);
      renderer.render(scene, new PerspectiveCamera());
      assert.deepEqual([...await canvas.readPixels()], Array(4).fill([255, 0, 0, 255]).flat());
      renderer.setSize(3, 2, false);
      scene.background.set(0x00ff00);
      renderer.render(scene, new PerspectiveCamera());
      assert.deepEqual([...await canvas.readPixels()], Array(6).fill([0, 255, 0, 255]).flat());
    } finally {
      try { await renderer.dispose(); } finally { await canvas.dispose(); }
    }
    assert.deepEqual(names.map(name => Object.getOwnPropertyDescriptor(globalThis, name)), before);
    assert.deepEqual({ ...process.env }, environment);
    await assert.rejects(canvas.readPixels());
  }
});

test('classic Worker failure terminates a waiting loader visibly', { timeout: 15000 }, async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const source = `
    import { createCanvas } from '@drawcall/webgpu';
    await createCanvas(2, 2);
    const url = URL.createObjectURL(new Blob(['throw new Error("worker-regression-marker")']));
    new Worker(url);
    await new Promise(() => {});
  `;
  await assert.rejects(promisify(execFile)(process.execPath, ['--input-type=module', '-e', source], { timeout: 10000 }), error => {
    assert.equal(error.killed, false, 'Worker failure must not hang until timeout');
    assert.equal(error.code, 1);
    assert.match(error.stderr, /worker-regression-marker/);
    return true;
  });
});
