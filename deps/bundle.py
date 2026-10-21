"""Bundle Linux shared dependencies, leaving only the host libc external."""
import argparse
import hashlib
import json
import platform
import re
import shutil
import subprocess
from pathlib import Path

MUSL = re.compile(r"^(libc\.musl-(x86_64|aarch64)\.so\.1|ld-musl-(x86_64|aarch64)\.so\.1)$")

GLIBC = re.compile(r"^(lib(c|m|mvec|dl|pthread|rt|resolv|util|anl|BrokenLocale)\.so\.|ld-linux)")


def capture(*args):
    return subprocess.check_output([str(arg) for arg in args], text=True)


def is_musl():
    return bool(list(Path("/lib").glob("ld-musl-*.so.1")))


def musl_dependencies(binary):
    # musl's ldd resolves symbols, so an addon without Node's N-API exports fails.
    for name in capture("patchelf", "--print-needed", binary).splitlines():
        if MUSL.fullmatch(name):
            continue
        paths = [binary.parent / name, Path("/lib") / name, Path("/usr/lib") / name]
        dependency = next((path for path in paths if path.is_file()), None)
        if dependency is None:
            raise RuntimeError(f"Missing dependency: {binary} -> {name}")
        yield dependency


def dependencies(binary):
    if is_musl():
        yield from musl_dependencies(binary)
        return
    output = capture("ldd", binary)
    if "not found" in output:
        raise RuntimeError(f"Missing dependencies for {binary}:\n{output}")
    for line in output.splitlines():
        match = re.match(r"\s*(\S+) => (/\S+)", line)
        if match and not GLIBC.match(match[1]):
            yield Path(match[2])


def copyright_files(source):
    if shutil.which("apk"):
        raise RuntimeError(f"Unexpected Alpine shared dependency {source}; link it statically with its source notices")
    if shutil.which("rpm"):
        files = capture("rpm", "-q", "--licensefiles", "-f", Path(source).resolve()).splitlines()
        if not files:
            documents = capture("rpm", "-q", "--docfiles", "-f", Path(source).resolve()).splitlines()
            files = [path for path in documents
                     if re.match(r"^(copying|copyright|licen[cs]e)([._-]|$)", Path(path).name, re.IGNORECASE)]
        if not files:
            raise RuntimeError(f"No RPM license files for {source}")
        return {Path(path) for path in files}
    paths = {source, str(Path(source).resolve())}
    if source.startswith("/lib/"):
        paths.add("/usr" + source)
    result = subprocess.run(["dpkg-query", "-S", *sorted(paths)], text=True, capture_output=True)
    owners = {line.split(": ", 1)[0].split(":")[0] for line in result.stdout.splitlines()
              if ": " in line}
    if len(owners) != 1:
        raise RuntimeError(f"Cannot identify Debian license for {source}: {result.stdout}{result.stderr}")
    return {Path("/usr/share/doc") / owners.pop() / "copyright"}


def bundle(output):
    if platform.system() != "Linux":
        raise RuntimeError("ELF dependency bundling requires Linux")
    loader = output / "libvulkan.so.1"
    if not loader.is_file():
        raise RuntimeError(f"Build the pinned Vulkan loader first: {loader}")
    queue = [output / "dawn.node", output / "libvulkan_lvp.so", loader]
    copied = {}
    while queue:
        binary = queue.pop()
        name = binary.name
        if name in copied:
            continue
        queue.extend(dependencies(binary))
        destination = output / name
        if binary.resolve() != destination.resolve():
            shutil.copy2(binary, destination)
        copied[name] = str(binary)
    for name in copied:
        subprocess.run(["patchelf", "--set-rpath", "$ORIGIN", str(output / name)], check=True)
    notices = set()
    for source in copied.values():
        if Path(source).parent == output:
            continue
        notices.update(copyright_files(source))
    with (output / "DEPENDENCY_NOTICES").open("w") as stream:
        for path in sorted(notices):
            stream.write(f"\n{'=' * 72}\n{path}\n\n")
            stream.write(path.read_text())
    manifest_path = output / "build.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["sha256"] = hashlib.sha256((output / "dawn.node").read_bytes()).hexdigest()
    manifest["libraries"] = {
        name: hashlib.sha256((output / name).read_bytes()).hexdigest() for name in sorted(copied)
    }
    if is_musl():
        manifest["libc"] = "musl"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        return
    manifest["libc"] = "glibc"
    manifest["glibc"] = capture("getconf", "GNU_LIBC_VERSION").strip()
    requirements = set()
    for name in copied:
        requirements.update(re.findall(rb"GLIBC_(\d+\.\d+)", (output / name).read_bytes()))
    manifest["glibcRequired"] = max(requirements, key=lambda value: tuple(map(int, value.split(b".")))).decode()
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    bundle(parser.parse_args().output.resolve())
