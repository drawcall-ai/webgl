import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES } from './scenes.js';

const execute = promisify(execFile);
for (const scene of SCENES) {
  test(`${scene} renders original assets with stock Three loaders`, { timeout: 120000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'webgpu-test-'));
    const output = join(directory, 'render.png');
    const cwd = fileURLToPath(new URL('../', import.meta.url));
    try {
      const { stdout } = await execute(process.execPath, ['test/render.js', scene, output], { cwd, timeout: 90000 });
      const { hash } = JSON.parse(stdout);
      await execute(process.execPath, ['test/verify.js', scene, output, hash], { cwd, timeout: 20000 });
    } catch (error) {
      console.error({ scene, code: error.code, signal: error.signal, killed: error.killed });
      throw error;
    } finally { await rm(directory, { recursive: true }); }
  });
}
