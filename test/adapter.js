import assert from 'node:assert/strict';
import { createCanvas } from '@drawcall/webgpu';

const canvas = await createCanvas(1, 1);
try {
  const adapter = await navigator.gpu.requestAdapter();
  assert.ok(adapter, 'No WebGPU adapter');
  const info = adapter.info;
  const result = {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
    isFallbackAdapter: info.isFallbackAdapter,
    features: [...adapter.features].sort(),
  };
  console.log(JSON.stringify(result));
  assert.match(`${info.vendor} ${info.architecture} ${info.device} ${info.description}`, /llvmpipe|lavapipe/i, 'CI must use the bundled Mesa software adapter');
} finally {
  await canvas.dispose();
}
