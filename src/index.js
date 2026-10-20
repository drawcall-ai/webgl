import { canvas } from './canvas.js';
import { globals } from './globals.js';
import { installImages } from './image.js';
import { loadNative } from './native.js';
import { installWorkers } from './worker.js';

let active = false;

/**
 * Creates an opaque sRGB WebGPU canvas and installs the native loader platform.
 * One canvas may be active per process. Pass it to Three's
 * WebGPURenderer with alpha: false. Dispose loaders, scene resources, and the
 * renderer before awaiting canvas.dispose(). No Three.js code is imported here.
 */
export async function createCanvas(width, height) {
  if (active) throw new Error('Only one canvas may be active per process');
  const installed = globals();
  const frames = new Set();
  let restoreNative, restoreImages, restoreWorkers;
  let gpu, disposal;
  const target = canvas(width, height, () => {
    if (disposal) throw new Error('Canvas is disposed');
  });
  active = true;

  function dispose() {
    disposal ??= (async () => {
      const failures = [];
      const actions = [
        () => { for (const frame of frames) clearTimeout(frame); frames.clear(); },
        () => restoreWorkers?.(),
        () => target.close(),
        () => restoreImages?.(),
        () => installed.restore(),
        () => restoreNative?.(),
      ];
      for (const action of actions) {
        try { await action(); } catch (error) { failures.push(error); }
      }
      // GPU owns Dawn's instance and must outlive every device and renderer.
      gpu = undefined;
      active = false;
      if (failures.length) throw new AggregateError(failures, 'Canvas cleanup failed');
    })();
    return disposal;
  }

  try {
    const loaded = loadNative();
    restoreNative = loaded.restore;
    const native = loaded.native;
    for (const [name, value] of Object.entries(native.globals)) installed.set(name, value);
    installed.set('self', globalThis);
    installed.set('ProgressEvent', class extends Event {
      constructor(type, values = {}) { super(type); Object.assign(this, values); }
    });
    installed.set('requestAnimationFrame', callback => {
      const frame = setTimeout(() => { frames.delete(frame); callback(performance.now()); });
      frames.add(frame);
      return frame;
    });
    installed.set('cancelAnimationFrame', frame => { clearTimeout(frame); frames.delete(frame); });
    restoreImages = installImages(native);
    restoreWorkers = installWorkers();
    gpu = native.create(['backend=vulkan']);
    installed.set('navigator', { gpu, userAgent: 'Node.js' });
    target.output.dispose = dispose;
    return target.output;
  } catch (error) {
    try { await dispose(); } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Canvas initialization failed');
    }
    throw error;
  }
}
