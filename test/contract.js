export async function contractCases(device, pngBytes) {
  const bitmap = await createImageBitmap(new Blob([pngBytes], { type: 'image/png' }), {
    premultiplyAlpha: 'none', colorSpaceConversion: 'none',
  });
  const tests = [
    ...['r8unorm', 'r8snorm', 'rg8unorm', 'rg8snorm', 'rgba8snorm', 'rg11b10ufloat', 'rgb10a2unorm', 'rgba16float', 'rgba32float']
      .map(format => ({ name: `format-${format}`, format })),
    ...[[], [0], [0, 0], [0, 0, 0]].map(origin => ({ name: `origin-length-${origin.length}`, origin })),
    { name: 'zero-valid', size: [0, 0] },
    { name: 'zero-no-render-usage', size: [0, 0], usage: GPUTextureUsage.COPY_DST },
    { name: 'zero-bad-mip', size: [0, 0], mipLevel: 9 },
    { name: 'zero-destroyed', size: [0, 0], destroy: true },
    { name: 'zero-outside', size: [0, 0], destinationOrigin: [3, 0] },
  ];
  const results = [];
  try {
    for (const test of tests) {
      device.pushErrorScope('validation');
      const texture = device.createTexture({
        size: [2, 2], format: test.format ?? 'rgba8unorm',
        usage: test.usage ?? (GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT),
      });
      const creation = await device.popErrorScope();
      const result = { name: test.name };
      if (creation) {
        result.creationError = creation.message;
        results.push(result);
        texture.destroy();
        continue;
      }
      if (test.destroy) texture.destroy();
      device.pushErrorScope('validation');
      try {
        device.queue.copyExternalImageToTexture(
          { source: bitmap, origin: test.origin ?? [0, 0] },
          { texture, mipLevel: test.mipLevel ?? 0, origin: test.destinationOrigin ?? [0, 0] },
          test.size ?? [1, 1],
        );
      } catch (error) {
        result.error = { name: error.name, message: error.message };
      }
      const validation = await device.popErrorScope();
      if (validation) result.validation = validation.message;
      texture.destroy();
      results.push(result);
    }
    return results;
  } finally { bitmap.close(); }
}
