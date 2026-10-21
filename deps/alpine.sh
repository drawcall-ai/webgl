#!/bin/sh
set -eu
apk add --no-cache build-base linux-headers python3 python3-dev py3-pip cmake ninja git curl tar xz bison flex clang patchelf pkgconf go
python3 -m venv /opt/build-tools
. /opt/build-tools/bin/activate
pip install meson==1.7.0 mako pyyaml packaging
python native/build.py build "dist/$1"
python deps/mesa.py "dist/$1" --work build/mesa --jobs 4
python deps/bundle.py "dist/$1"
node deps/package.js "dist/$1"
python deps/check.py "dist/$1"
npm run test:package -- "dist/$1"
