"""Build in Modal: modal run native/cloud.py"""
from pathlib import Path
import subprocess
import modal

ROOT = Path(__file__).resolve().parents[1]
app = modal.App("drawcall-webgpu-build")
volume = modal.Volume.from_name("drawcall-webgpu-build", create_if_missing=True)
image = (
    modal.Image.from_registry("node:24-bookworm-slim", add_python="3.12")
    .apt_install("git", "cmake", "ninja-build", "build-essential", "curl", "ca-certificates", "pkg-config", "libvulkan1", "libdrm2", "zlib1g", "libzstd1", "libudev1", "patchelf")
    .pip_install("ninja==1.13.0")
    .run_commands("curl -fL https://go.dev/dl/go1.24.2.linux-amd64.tar.gz -o /tmp/go.tar.gz && echo '68097bd680839cbc9d464a0edce4f7c333975e27a90246890e9f1078c7e702ad  /tmp/go.tar.gz' | sha256sum -c - && tar -C /usr/local -xzf /tmp/go.tar.gz && rm /tmp/go.tar.gz")
    .env({"PATH": "/usr/local/go/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"})
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
        ["python", "/repo/native/build.py", "/build/bookworm-source", output],
        ["python", "/repo/deps/mesa.py", output],
        ["python", "/repo/deps/bundle.py", output],
        ["node", "/repo/deps/package.js", output],
        ["python", "/repo/deps/check.py", output],
    ]:
        subprocess.run(command, check=True)
    volume.commit()
    return (Path(output) / "build.json").read_text()


@app.local_entrypoint()
def main():
    print(build.remote())
