"""Build portable lavapipe from pinned sources on a manylinux 2.28 host."""
import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
from pathlib import Path

SOURCES = {
    "llvm": (
        "https://github.com/llvm/llvm-project/releases/download/llvmorg-19.1.7/llvm-project-19.1.7.src.tar.xz",
        "82401fea7b79d0078043f7598b835284d6650a75b93e64b6f761ea7b63097501",
    ),
    "glslang": (
        "https://codeload.github.com/KhronosGroup/glslang/tar.gz/1062752a891c95b2bfeed9e356562d88f9df84ac",
        "46a05bba7675a3ab1912a0908183b9eee8daa06bb8047943bac54a6f0de2cfce",
    ),
    "libdrm": (
        "https://dri.freedesktop.org/libdrm/libdrm-2.4.124.tar.xz",
        "ac36293f61ca4aafaf4b16a2a7afff312aa4f5c37c9fbd797de9e3c0863ca379",
    ),
    "mesa": (
        "https://archive.mesa3d.org/mesa-25.0.7.tar.xz",
        "592272df3cf01e85e7db300c449df5061092574d099da275d19e97ef0510f8a6",
    ),
}


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def fetch(name, work):
    url, checksum = SOURCES[name]
    destination = work / name
    stamp = destination / ".drawcall-source"
    if stamp.exists() and stamp.read_text() == checksum:
        return destination
    archive = work / f"{name}.tar"
    run("curl", "-fL", "--retry", "3", url, "-o", archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != checksum:
        raise RuntimeError(f"{name} source checksum mismatch")
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir()
    members = [f"llvm-project-19.1.7.src/{component}" for component in
               ("llvm", "cmake", "third-party", "libc")] if name == "llvm" else []
    run("tar", "-xf", archive, "--strip-components=1", "-C", destination, *members)
    archive.unlink()
    stamp.write_text(checksum)
    return destination


def cmake(source, build, prefix, jobs, options, targets):
    run("cmake", "-S", source, "-B", build, "-G", "Ninja", "-DCMAKE_BUILD_TYPE=Release",
        f"-DCMAKE_INSTALL_PREFIX={prefix}", "-DCMAKE_POSITION_INDEPENDENT_CODE=ON", *options)
    run("cmake", "--build", build, "--parallel", jobs, "--target", *targets)


def meson(source, build, prefix, jobs, options):
    reconfigure = ["--reconfigure"] if (build / "meson-private/coredata.dat").exists() else []
    run("meson", "setup", *reconfigure, build, source, f"--prefix={prefix}", "--libdir=lib",
        "--buildtype=release", "-Db_ndebug=true", *options)
    run("ninja", "-C", build, "-j", jobs, "install")


def notices(sources, output):
    with (output / "MESA_NOTICES").open("w") as stream:
        for source in sources:
            for path in sorted(source.rglob("*")):
                if not path.is_file() or not path.name.upper().startswith(("LICENSE", "COPYING", "NOTICE")):
                    continue
                if path.suffix in {".py", ".go", ".json", ".h", ".cc", ".cpp"}:
                    continue
                stream.write(f"\n{'=' * 72}\n{source.name}/{path.relative_to(source)}\n\n")
                stream.write(path.read_text(errors="replace"))


def build(work, output, jobs):
    target = {"x86_64": "X86", "aarch64": "AArch64"}.get(platform.machine())
    if platform.system() != "Linux" or target is None:
        raise RuntimeError("The portable Mesa build supports Linux x64 and arm64")
    if jobs < 1:
        raise ValueError("Build jobs must be positive")
    work.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    prefix = work / "toolchain"
    sources = {name: fetch(name, work) for name in SOURCES}
    cmake(sources["llvm"] / "llvm", work / "llvm-build", prefix, jobs, [
        f"-DLLVM_TARGETS_TO_BUILD={target}", "-DLLVM_BUILD_TOOLS=OFF", "-DLLVM_INCLUDE_TESTS=OFF",
        "-DLLVM_INCLUDE_EXAMPLES=OFF", "-DLLVM_INCLUDE_BENCHMARKS=OFF", "-DLLVM_INCLUDE_DOCS=OFF",
        "-DLLVM_ENABLE_ZLIB=OFF", "-DLLVM_ENABLE_ZSTD=OFF", "-DLLVM_ENABLE_LIBXML2=OFF",
        "-DLLVM_ENABLE_TERMINFO=OFF", "-DLLVM_ENABLE_LIBEDIT=OFF", "-DLLVM_ENABLE_RTTI=ON",
    ], ["install-llvm-libraries", "install-llvm-headers", "install-cmake-exports", "llvm-config"])
    (prefix / "bin").mkdir(exist_ok=True)
    shutil.copy2(work / "llvm-build/bin/llvm-config", prefix / "bin/llvm-config")
    cmake(sources["glslang"], work / "glslang-build", prefix, jobs, [
        "-DENABLE_OPT=OFF", "-DGLSLANG_TESTS=OFF", "-DENABLE_HLSL=OFF", "-DBUILD_SHARED_LIBS=OFF",
    ], ["install"])
    meson(sources["libdrm"], work / "libdrm-build", prefix, jobs, [
        "-Ddefault_library=static", "-Dtests=false", "-Dman-pages=disabled", "-Dudev=false",
        *[f"-D{driver}=disabled" for driver in
          ("intel", "radeon", "amdgpu", "nouveau", "vmwgfx", "freedreno", "vc4", "etnaviv")],
    ])
    os.environ["PKG_CONFIG_PATH"] = str(prefix / "lib/pkgconfig")
    tools = work / "tools.ini"
    tools.write_text(f"[binaries]\nllvm-config = '{prefix}/bin/llvm-config'\n"
                     f"glslangValidator = '{prefix}/bin/glslang'\n")
    exports = f"-Wl,--version-script={sources['mesa']}/src/vulkan/vulkan.sym"
    meson(sources["mesa"], work / "mesa-build", work / "installed", jobs, [
        "--native-file", tools, "--force-fallback-for=zlib", "-Dzlib:default_library=static",
        "-Dgallium-drivers=llvmpipe", "-Dvulkan-drivers=swrast", "-Dplatforms=",
        "-Dglx=disabled", "-Degl=disabled", "-Dgles1=disabled", "-Dgles2=disabled", "-Dopengl=false",
        "-Dllvm=enabled", "-Dshared-llvm=disabled", "-Dgbm=disabled", "-Dvideo-codecs=", "-Dtools=",
        "-Dzstd=disabled", "-Dvulkan-layers=", "-Dxmlconfig=disabled", "-Dlibunwind=disabled",
        "-Dvalgrind=disabled", "-Dlmsensors=disabled", "-Dshader-cache=enabled", "-Dstrip=true",
        "-Dc_link_args=" + json.dumps([exports]),
        "-Dcpp_link_args=" + json.dumps([exports, "-static-libstdc++", "-static-libgcc"]),
    ])
    shutil.copy2(work / "installed/lib/libvulkan_lvp.so", output / "libvulkan_lvp.so")
    icds = list((work / "installed/share/vulkan/icd.d").glob("lvp_icd*.json"))
    if len(icds) != 1:
        raise RuntimeError(f"Expected one installed lavapipe ICD, got {icds}")
    icd = json.loads(icds[0].read_text())
    icd["ICD"]["library_path"] = "./libvulkan_lvp.so"
    (output / "lvp_icd.json").write_text(json.dumps(icd, indent=2) + "\n")
    manifest_path = output / "build.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["mesa"] = {name: {"url": url, "sha256": checksum} for name, (url, checksum) in SOURCES.items()}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    notices(sources.values(), output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--work", type=Path, default=Path("build/mesa"))
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()
    build(args.work.resolve(), args.output.resolve(), args.jobs)
