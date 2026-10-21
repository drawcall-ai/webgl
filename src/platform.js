import { familySync } from 'detect-libc';

export function nativeTarget(platform = process.platform, arch = process.arch, libc = platform === 'linux' ? familySync() : null) {
  if (!['linux', 'darwin', 'win32'].includes(platform) || !['x64', 'arm64'].includes(arch)) {
    throw new Error(`@drawcall/webgpu has no native package for ${platform}-${arch}`);
  }
  if (platform !== 'linux') return `${platform}-${arch}`;
  if (libc === 'glibc') return `linux-${arch}`;
  if (libc === 'musl') return `linuxmusl-${arch}`;
  throw new Error(`@drawcall/webgpu cannot select a Linux native package: unrecognized libc ${libc}`);
}
