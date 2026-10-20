// Shared platform contract probe. These synthetic pixels are test inputs, never
// replacements for benchmark assets. Run the same cases in Chromium and Node.
export async function imageCases(device, pngBytes) {
  const cases = [
    { name: 'rgba' },
    { name: 'flip', flipY: true },
    { name: 'bitmap-flip', imageOrientation: 'flipY' },
    { name: 'crop', origin: [1, 0], size: [2, 2] },
    { name: 'crop-flip', origin: [1, 0], size: [2, 2], flipY: true },
    { name: 'top-row-flip', origin: [0, 0], size: [3, 1], flipY: true },
    { name: 'bottom-row-flip', origin: [0, 1], size: [3, 1], flipY: true },
    { name: 'destination-offset', destinationOrigin: [1, 1] },
    { name: 'bgra', format: 'bgra8unorm' },
    { name: 'rgba-srgb', format: 'rgba8unorm-srgb' },
    { name: 'bgra-srgb', format: 'bgra8unorm-srgb' },
    { name: 'premultiplied-destination', premultipliedAlpha: true },
    { name: 'premultiplied-source', premultiplyAlpha: 'premultiply' },
    { name: 'display-p3-destination', colorSpace: 'display-p3' },
    { name: 'closed-source', closeBefore: true },
    { name: 'source-out-of-bounds', origin: [2, 0] },
  ];
  const results = [];
  for (const test of cases) {
    const bitmap = await createImageBitmap(new Blob([pngBytes], { type: 'image/png' }), {
      premultiplyAlpha: test.premultiplyAlpha ?? 'none',
      colorSpaceConversion: 'none',
      imageOrientation: test.imageOrientation ?? 'from-image',
    });
    const texture = device.createTexture({
      size: [4, 4], format: test.format ?? 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const buffer = device.createBuffer({
      size: 4 * 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    device.pushErrorScope('validation');
    const result = { name: test.name };
    try {
      if (test.closeBefore) bitmap.close();
      device.queue.copyExternalImageToTexture(
        { source: bitmap, origin: test.origin ?? [0, 0], flipY: test.flipY ?? false },
        { texture, origin: test.destinationOrigin ?? [0, 0],
          premultipliedAlpha: test.premultipliedAlpha ?? false,
          colorSpace: test.colorSpace ?? 'srgb' },
        test.size ?? [3, 2],
      );
      // The upload must snapshot its source before this close.
      bitmap.close();
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture }, { buffer, bytesPerRow: 256, rowsPerImage: 4 }, [4, 4],
      );
      device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(buffer.getMappedRange());
      result.pixels = Array.from({ length: 4 }, (_, y) => [...mapped.slice(y * 256, y * 256 + 16)]).flat();
      buffer.unmap();
    } catch (error) {
      result.error = { name: error.name, message: error.message };
    } finally {
      const error = await device.popErrorScope();
      if (error) result.validation = { name: error.constructor.name, message: error.message };
      bitmap.close();
      buffer.destroy();
      texture.destroy();
    }
    results.push(result);
  }
  return results;
}
