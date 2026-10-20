"""Test packed packages without source-checkout or native-path fallbacks."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('native_dir', type=Path)
    parser.add_argument('--repetitions', type=int, default=3)
    args = parser.parse_args()
    if args.repetitions < 1:
        parser.error('--repetitions must be positive')
    native = args.native_dir.resolve(strict=True)
    npm = shutil.which('npm')
    node = shutil.which('node')
    if not npm or not node:
        raise RuntimeError('Node.js and npm must be on PATH')
    env = dict(os.environ)
    env.pop('DRAWCALL_WEBGPU_NATIVE', None)
    three = json.loads((ROOT / 'package.json').read_text())['devDependencies']['three']
    with tempfile.TemporaryDirectory(prefix='webgpu-consumer-') as temporary:
        directory = Path(temporary)
        packages = []
        for source in (ROOT, native):
            packed = subprocess.run(
                [npm, 'pack', str(source), '--json', '--pack-destination', str(directory)],
                cwd=ROOT, env=env, check=True, capture_output=True, text=True,
            )
            packages.append(str(directory / json.loads(packed.stdout)[0]['filename']))
        consumer = directory / 'consumer'
        consumer.mkdir()
        (consumer / 'package.json').write_text(json.dumps({'private': True, 'type': 'module'}))
        subprocess.run(
            [npm, 'install', '--ignore-scripts', '--save-exact', *packages, f'three@{three}'],
            cwd=consumer, env=env, check=True,
        )
        shutil.copytree(ROOT / 'test', consumer / 'test', ignore=shutil.ignore_patterns('out', '__pycache__'))
        try:
            subprocess.run(
                [node, 'test/ci.js', str(args.repetitions)],
                cwd=consumer, env=env, check=True,
            )
        finally:
            output = consumer / 'test/out'
            if output.exists():
                shutil.copytree(output, ROOT / 'test/out', dirs_exist_ok=True)


if __name__ == '__main__':
    main()
