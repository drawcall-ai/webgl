"""Reject native runtime dependencies that are neither bundled nor OS libraries."""
import argparse
import ctypes
import platform
import re
import subprocess
from pathlib import Path

from bundle import GLIBC

WINDOWS = {
    "advapi32.dll", "bcrypt.dll", "comdlg32.dll", "crypt32.dll", "dbghelp.dll",
    "gdi32.dll", "imm32.dll", "iphlpapi.dll", "kernel32.dll", "msvcrt.dll",
    "ntdll.dll", "ole32.dll", "oleaut32.dll", "powrprof.dll", "psapi.dll",
    "rpcrt4.dll", "secur32.dll", "setupapi.dll", "shell32.dll", "shlwapi.dll",
    "ucrtbase.dll", "user32.dll", "userenv.dll", "version.dll", "winmm.dll",
    "wintrust.dll", "ws2_32.dll", "node.exe",
}


def capture(*args):
    return subprocess.check_output([str(arg) for arg in args], text=True)


def linux(binary, directory):
    versions = re.findall(rb"GLIBC_(\d+\.\d+)", binary.read_bytes())
    required = max((tuple(map(int, value.split(b"."))) for value in versions), default=(0, 0))
    if required > (2, 28):
        raise RuntimeError(f"{binary.name} requires glibc {required}, exceeding the 2.28 baseline")
    output = capture("ldd", binary)
    print(output)
    if "not found" in output:
        raise RuntimeError(f"Missing dependency of {binary}")
    for name, path in re.findall(r"\s*(\S+) => (/\S+)", output):
        if not GLIBC.match(name) and Path(path).resolve().parent != directory:
            raise RuntimeError(f"Unbundled dependency: {binary.name} -> {path}")
    for path in re.findall(r"^\s*(/\S+) \(", output, re.MULTILINE):
        if not GLIBC.match(Path(path).name) and Path(path).resolve().parent != directory:
            raise RuntimeError(f"Absolute external dependency: {binary.name} -> {path}")


def darwin(binary, directory):
    output = capture("otool", "-L", binary)
    print(output)
    for line in output.splitlines()[1:]:
        dependency = line.strip().split(" (", 1)[0]
        if dependency.startswith(("/usr/lib/", "/System/Library/")):
            continue
        if binary.suffix == ".dylib" and Path(dependency).name == binary.name:
            continue
        if dependency.startswith("@loader_path/") and (binary.parent / dependency[13:]).resolve().is_relative_to(directory):
            if (binary.parent / dependency[13:]).is_file():
                continue
        raise RuntimeError(f"Unbundled dependency: {binary.name} -> {dependency}")


def windows(binary, directory):
    output = capture("dumpbin", "/DEPENDENTS", binary)
    print(output)
    dependencies = re.findall(r"^\s+([\w.-]+\.(?:dll|exe))\s*$", output, re.MULTILINE | re.IGNORECASE)
    if not dependencies:
        raise RuntimeError(f"No PE dependency data for {binary}")
    for name in dependencies:
        if name.lower() in WINDOWS or name.lower().startswith(("api-ms-win-", "ext-ms-win-")):
            continue
        if (directory / name).is_file():
            continue
        raise RuntimeError(f"Unbundled dependency: {binary.name} -> {name}")


def check(directory):
    host = platform.system()
    audit = {"Linux": linux, "Darwin": darwin, "Windows": windows}.get(host)
    if not audit:
        raise RuntimeError(f"Unsupported native platform: {host}")
    binaries = [directory / "dawn.node"]
    binaries.extend(path for path in directory.iterdir()
                    if path.is_file() and (".so" in path.name or path.suffix in {".dylib", ".dll"}))
    if host == "Linux":
        ctypes.CDLL(str(directory / "libvulkan.so.1"))
    for binary in binaries:
        audit(binary, directory)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    check(parser.parse_args().directory.resolve(strict=True))
