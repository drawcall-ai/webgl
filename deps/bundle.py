"""Bundle Linux shared dependencies; glibc remains the host ABI baseline."""
import argparse
import hashlib
import json
import platform
import re
import shutil
import subprocess
from pathlib import Path

GLIBC = re.compile(r"^(lib(c|m|mvec|dl|pthread|rt|resolv|util|anl|BrokenLocale)\.so\.|ld-linux)")


def capture(*args):
    return subprocess.check_output([str(arg) for arg in args], text=True)


def dependencies(binary):
    output = capture("ldd", binary)
    if "not found" in output:
        raise RuntimeError(f"Missing dependencies for {binary}:\n{output}")
    for line in output.splitlines():
        match = re.match(r"\s*(\S+) => (/\S+)", line)
        if match and not GLIBC.match(match[1]):
            yield Path(match[2])


def copyright_files(source):
    if shutil.which("rpm"):
        files = capture("rpm", "-q", "--licensefiles", "-f", Path(source).resolve()).splitlines()
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
    loader = re.search(r"libvulkan\.so\.1 .+ => (/\S+)", capture("/sbin/ldconfig", "-p"))
    if not loader:
        raise RuntimeError("Install the Vulkan loader in the build image")
    queue = [output / "dawn.node", output / "libvulkan_lvp.so", Path(loader[1])]
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
