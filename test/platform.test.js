import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry = import.meta.resolve('@drawcall/webgpu');
const { nativeTarget } = await import(new URL('./platform.js', entry));
const { optionalDependencies } = JSON.parse(readFileSync(new URL('../package.json', entry)));

test('native package selection matches published platform dependencies', () => {
  const targets = [];
  for (const arch of ['x64', 'arm64']) {
    for (const [platform, libc, prefix] of [
      ['linux', 'glibc', 'linux'],
      ['linux', 'musl', 'linuxmusl'],
      ['darwin', null, 'darwin'],
      ['win32', null, 'win32'],
    ]) {
      const target = nativeTarget(platform, arch, libc);
      assert.equal(target, `${prefix}-${arch}`);
      targets.push(`@drawcall/webgpu-${target}`);
    }
  }
  assert.deepEqual(targets.sort(), Object.keys(optionalDependencies).sort());
});

test('unsupported CPUs and unknown libc never select an incompatible binary', () => {
  assert.throws(() => nativeTarget('linux', 'arm64', null), /unrecognized libc/);
  assert.throws(() => nativeTarget('linux', 'arm64', 'unknown'), /unrecognized libc/);
  assert.throws(() => nativeTarget('linux', 'ia32', 'musl'), /no native package/);
  assert.throws(() => nativeTarget('freebsd', 'x64', null), /no native package/);
});
