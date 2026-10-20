import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const mark = value => writeFileSync(2, `[consumer] ${value}\n`);
process.on('exit', code => mark(`exit ${code}`));
process.on('uncaughtExceptionMonitor', error => mark(error.stack));

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { repetitions: { type: 'string', default: '3' }, version: { type: 'string' } },
});
assert.equal(positionals.length, values.version === undefined ? 1 : 0, 'Supply either dist/TARGET or --version VERSION, not both');
if (values.version !== undefined) assert.match(values.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Version must be an exact stable release');
const repetitions = Number(values.repetitions);
assert.ok(Number.isSafeInteger(repetitions) && repetitions > 0, 'Repetitions must be a positive integer');
const npm = process.env.npm_execpath;
assert.ok(npm, 'Invoke through npm run test:package so the npm CLI path is available');
const root = fileURLToPath(new URL('../', import.meta.url));
const three = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies.three;
const env = { ...process.env };
delete env.DRAWCALL_WEBGPU_NATIVE;
const directory = mkdtempSync(join(tmpdir(), 'webgpu consumer ü 渲染 '));

function run(args, cwd, capture = false) {
  mark(`start ${JSON.stringify(args)}`);
  const result = spawnSync(process.execPath, args, {
    cwd, env, encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  mark(`done status=${result.status} signal=${result.signal} error=${result.error?.stack}`);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Child failed: ${args}`);
  return result.stdout;
}

try {
  const packages = values.version === undefined ? [root, realpathSync(positionals[0])].map(source => {
    const result = JSON.parse(run([npm, 'pack', source, '--json', '--pack-destination', directory], root, true));
    return join(directory, result[0].filename);
  }) : [`@drawcall/webgpu@${values.version}`];
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
    mark(`before copy ${output} -> ${join(root, 'test/out')}`);
    if (existsSync(output)) cpSync(output, join(root, 'test/out'), { recursive: true });
    mark('after copy');
  }
} finally {
  mark('before cleanup');
  rmSync(directory, { recursive: true, force: true });
  mark('after cleanup');
}
