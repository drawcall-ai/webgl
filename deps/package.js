import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('Usage: node deps/package.js OUTPUT_DIR');
const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const target = `${process.platform}-${process.arch}`;
const supported = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64'];
if (!supported.includes(target)) throw new Error(`Unsupported native package target: ${target}`);
const mesa = process.platform === 'linux';
const manifest = {
  name: `@drawcall/webgpu-${target}`,
  version: root.version,
  description: `Dawn and ${mesa ? 'Mesa lavapipe' : 'SwiftShader'} for CPU rendering on ${target}`,
  license: mesa
    ? 'BSD-3-Clause AND MIT AND Zlib AND LGPL-2.1-or-later AND Apache-2.0 WITH LLVM-exception AND GPL-3.0-or-later WITH GCC-exception-3.1'
    : 'BSD-3-Clause AND MIT AND Apache-2.0',
  repository: root.repository,
  os: [process.platform],
  cpu: [process.arch],
  ...(mesa ? { libc: ['glibc'] } : {}),
  files: ['dawn.node', '*.so*', '*.dylib', '*.dll', '*_icd.json', 'build.json', '*NOTICES', 'LICENSE'],
};
writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
for (const file of mesa ? ['LICENSE', 'THIRD_PARTY_NOTICES'] : ['LICENSE']) {
  copyFileSync(new URL(`../${file}`, import.meta.url), join(dir, file));
}
