#!/bin/bash
set -euo pipefail
# Dawn loads the Vulkan loader dynamically from its own module directory.
python3 -c 'import ctypes,sys; ctypes.CDLL(sys.argv[1])' "$1/libvulkan.so.1"
for file in "$1/dawn.node" "$1/"*.so*; do
  output=$(ldd "$file")
  echo "$output"
  if [[ "$output" == *"not found"* ]]; then exit 1; fi
done
