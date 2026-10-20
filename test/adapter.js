import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@drawcall/webgpu';

const directory = await mkdtemp(join(tmpdir(), 'webgpu-icd-'));
const missingManifest = join(directory, 'missing.json');
const names = ['VK_DRIVER_FILES', 'VK_ICD_FILENAMES'];
const previous = names.map(name => process.env[name]);
for (const name of names) process.env[name] = missingManifest;
let canvas;
try {
  canvas = await createCanvas(1, 1);
  for (const name of names) assert.equal(process.env[name], missingManifest, `${name} changed while canvas was active`);
  const adapter = await navigator.gpu.requestAdapter();
  assert.ok(adapter, 'No WebGPU adapter');
  for (const name of names) assert.equal(process.env[name], missingManifest, `${name} changed during adapter selection`);
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
  try {
    await canvas?.dispose();
    for (const name of names) assert.equal(process.env[name], missingManifest, `${name} changed after canvas disposal`);
  } finally {
    for (const [index, name] of names.entries()) {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    }
    await rm(directory, { recursive: true });
  }
}
