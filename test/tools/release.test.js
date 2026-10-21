import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const digest = text => createHash('sha256').update(text).digest('hex');

test('release preparation rejects stale binaries, packs all targets, and detects tarball tampering before publishing', () => {
  assert.ok(process.env.npm_execpath, 'Run through npm run test:release');
  const root = mkdtempSync(join(tmpdir(), 'webgpu release ü 渲染 '));
  const write = (path, text) => writeFileSync(join(root, path), text);
  const json = (path, value) => write(path, JSON.stringify(value));
  const names = Object.keys(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).optionalDependencies);
  try {
    for (const directory of ['deps', 'src', 'skills/webgpu', 'native']) mkdirSync(join(root, directory), { recursive: true });
    copyFileSync(new URL('../../deps/release.js', import.meta.url), join(root, 'deps/release.js'));
    write('native/driver.cpp', 'current source');
    write('src/index.js', 'export const fixture = true;');
    write('skills/webgpu/SKILL.md', 'Fixture skill');
    write('README.md', 'Fixture');
    write('LICENSE', 'Fixture license');
    json('package.json', {
      name: '@drawcall/webgpu', version: '0.1.0', type: 'module', files: ['src', 'skills'],
      optionalDependencies: Object.fromEntries(names.map(name => [name, '0.1.0'])),
    });
    for (const name of names) {
      const target = name.slice('@drawcall/webgpu-'.length);
      const directory = `dist/${target}`;
      mkdirSync(join(root, directory), { recursive: true });
      json(`${directory}/package.json`, { name, version: '0.1.0', files: ['dawn.node', 'build.json', '*NOTICES', 'LICENSE'] });
      write(`${directory}/dawn.node`, 'fixture binary');
      for (const file of ['LICENSE', 'DAWN_NOTICES', 'MESA_NOTICES', 'THIRD_PARTY_NOTICES']) write(`${directory}/${file}`, 'Fixture notice');
      json(`${directory}/build.json`, {
        target, driver: 'mesa', patch: { 'driver.cpp': digest('current source') },
        libraries: { 'dawn.node': digest('fixture binary') },
      });
    }
    const run = (...args) => spawnSync(process.execPath, ['deps/release.js', ...args], { cwd: root, encoding: 'utf8' });
    const original = readFileSync(join(root, 'package.json'), 'utf8');
    write('native/driver.cpp', 'changed source');
    assert.match(run('prepare', '0.2.0').stderr, /Rebuild .*driver.cpp changed/);
    write('native/driver.cpp', 'current source');
    const prepared = run('prepare', '0.2.0');
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), original);
    const release = JSON.parse(readFileSync(join(root, 'dist/release/release.json')));
    assert.equal(release.version, '0.2.0');
    assert.deepEqual(release.packages.map(item => item.name), [...names, '@drawcall/webgpu']);
    const main = release.packages.at(-1);
    const unpack = spawnSync('tar', ['-xOf', join(root, 'dist/release', main.file), 'package/package.json'], { encoding: 'utf8' });
    assert.equal(unpack.status, 0, unpack.stderr);
    const packed = JSON.parse(unpack.stdout);
    assert.equal(packed.version, '0.2.0');
    assert.deepEqual(Object.values(packed.optionalDependencies), names.map(() => '0.2.0'));
    write(`dist/release/${main.file}`, 'tampered');
    const rejected = run('publish', '--dry-run');
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /checksum mismatch/);
    assert.equal(rejected.stdout, '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
