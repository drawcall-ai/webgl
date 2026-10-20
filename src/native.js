import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

function directory() {
  if (process.env.DRAWCALL_WEBGPU_NATIVE) return resolve(process.env.DRAWCALL_WEBGPU_NATIVE);
  const target = `${process.platform}-${process.arch}`;
  if (!['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64'].includes(target)) {
    throw new Error(`@drawcall/webgpu has no native package for ${target}`);
  }
  const local = fileURLToPath(new URL(`../dist/${target}/`, import.meta.url));
  if (existsSync(join(local, 'dawn.node'))) return local;
  try {
    return dirname(require.resolve(`@drawcall/webgpu-${target}/package.json`));
  } catch (cause) {
    throw new Error(`Install @drawcall/webgpu-${target}; npm optional dependencies must be enabled`, { cause });
  }
}

export function loadNative() {
  const dir = directory();
  const icd = join(dir, 'lvp_icd.json');
  if (!existsSync(icd)) throw new Error(`Missing software driver manifest: ${icd}`);
  const settings = {
    VK_DRIVER_FILES: icd,
    VK_ICD_FILENAMES: icd,
    LP_NUM_THREADS: '2',
    GALLIVM_PERF: 'nopt',
    // Cold processes cannot benefit from cross-render shader reuse. Disabling the
    // disk cache also avoids the cached vertex-object corruption seen in Mesa 26.
    MESA_SHADER_CACHE_DISABLE: 'true',
  };
  const previous = new Map(Object.keys(settings).map(key => [key, process.env[key]]));
  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  Object.assign(process.env, settings);
  try {
    const native = require(join(dir, 'dawn.node'));
    if (typeof native.createImageBitmapFromRGBA !== 'function') {
      throw new Error('The native binding lacks ImageBitmap support; use the @drawcall/webgpu native build');
    }
    return { native, restore };
  } catch (error) {
    restore();
    throw error;
  }
}
