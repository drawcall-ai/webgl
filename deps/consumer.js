import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { repetitions: { type: 'string', default: '3' } },
});
assert.equal(positionals.length, 1, 'Usage: npm run test:package -- dist/TARGET [--repetitions 3]');
const repetitions = Number(values.repetitions);
assert.ok(Number.isSafeInteger(repetitions) && repetitions > 0, 'Repetitions must be a positive integer');
const npm = process.env.npm_execpath;
assert.ok(npm, 'Invoke through npm run test:package so the npm CLI path is available');
const root = fileURLToPath(new URL('../', import.meta.url));
const native = realpathSync(positionals[0]);
const three = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies.three;
const env = { ...process.env };
delete env.DRAWCALL_WEBGPU_NATIVE;
const directory = mkdtempSync(join(tmpdir(), 'webgpu-consumer-'));

function run(args, cwd, capture = false) {
  return execFileSync(process.execPath, args, {
    cwd, env, encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

try {
  const packages = [root, native].map(source => {
    const result = JSON.parse(run([npm, 'pack', source, '--json', '--pack-destination', directory], root, true));
    return join(directory, result[0].filename);
  });
  const consumer = join(directory, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run([npm, 'install', '--ignore-scripts', '--save-exact', ...packages, `three@${three}`], consumer);
  cpSync(join(root, 'test'), join(consumer, 'test'), {
    recursive: true,
    filter: source => !['out', '__pycache__'].includes(basename(source)),
  });
  try {
    run(['test/ci.js', String(repetitions)], consumer);
  } finally {
    const output = join(consumer, 'test/out');
    if (existsSync(output)) cpSync(output, join(root, 'test/out'), { recursive: true });
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
