"""Build in Modal: modal run native/cloud.py"""
from pathlib import Path
import subprocess
import modal

ROOT = Path(__file__).resolve().parents[1]
app = modal.App("drawcall-webgpu-build")
volume = modal.Volume.from_name("drawcall-webgpu-build", create_if_missing=True)
image = (
    modal.Image.from_registry("node:24-trixie-slim", add_python="3.12")
    .apt_install("git", "cmake", "ninja-build", "build-essential", "curl", "ca-certificates", "pkg-config", "golang-go", "libvulkan1", "libdrm2", "zlib1g", "libzstd1", "libudev1")
    .add_local_dir(ROOT / "native", "/repo/native", ignore=["__pycache__"])
    .add_local_dir(ROOT / "deps", "/repo/deps", ignore=["__pycache__"])
    .add_local_file(ROOT / "package.json", "/repo/package.json")
    .add_local_file(ROOT / "LICENSE", "/repo/LICENSE")
    .add_local_file(ROOT / "THIRD_PARTY_NOTICES", "/repo/THIRD_PARTY_NOTICES")
)


@app.function(image=image, cpu=4, memory=8192, timeout=7200, volumes={"/build": volume})
def build():
    output = "/build/linux-x64"
    for command in [
        ["python", "/repo/native/build.py", "/build/source", output],
        ["python", "/repo/deps/mesa.py", output],
        ["node", "/repo/deps/package.js", output],
        ["bash", "/repo/deps/check.sh", output],
    ]:
        subprocess.run(command, check=True)
    volume.commit()
    return (Path(output) / "build.json").read_text()


@app.local_entrypoint()
def main():
    print(build.remote())
