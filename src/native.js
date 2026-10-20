import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
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
    if (cause.code !== 'MODULE_NOT_FOUND') throw cause;
    if (process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime) {
      throw new Error('@drawcall/webgpu Linux packages require glibc; this Node.js runtime reports no glibc. Musl-based systems such as Alpine are unsupported.', { cause });
    }
    throw new Error(`Install @drawcall/webgpu-${target}; npm optional dependencies must be enabled`, { cause });
  }
}

export function loadNative() {
  const dir = directory();
  const { driver } = JSON.parse(readFileSync(join(dir, 'build.json'), 'utf8'));
  if (!['mesa', 'swiftshader'].includes(driver)) throw new Error(`Unknown native driver: ${driver}`);
  const mesa = driver === 'mesa';
  const icd = join(dir, mesa ? 'lvp_icd.json' : 'vk_swiftshader_icd.json');
  if (!existsSync(icd)) throw new Error(`Missing software driver manifest: ${icd}`);
  const settings = mesa ? {
    VK_DRIVER_FILES: icd,
    VK_ICD_FILENAMES: icd,
    LP_NUM_THREADS: '2',
    GALLIVM_PERF: 'nopt',
    // Cold processes cannot benefit from cross-render shader reuse. Disabling the
    // disk cache also avoids the cached vertex-object corruption seen in Mesa 26.
    MESA_SHADER_CACHE_DISABLE: 'true',
  } : {};
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
    return { native, restore, flags: mesa ? ['backend=vulkan'] : ['backend=vulkan', 'adapter=SwiftShader'] };
  } catch (error) {
    restore();
    if (error.code === 'ERR_DLOPEN_FAILED') {
      throw Object.assign(new Error(`Cannot load @drawcall/webgpu for ${process.platform}-${process.arch} on Node.js ${process.version}: ${error.message}`, { cause: error }), { code: error.code });
    }
    throw error;
  }
}
