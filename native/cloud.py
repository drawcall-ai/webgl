"""Build in Modal: modal run native/cloud.py"""
from pathlib import Path
import subprocess
import modal

ROOT = Path(__file__).resolve().parents[1]
app = modal.App("drawcall-webgpu-build")
volume = modal.Volume.from_name("drawcall-webgpu-build", create_if_missing=True)
image = (
    modal.Image.from_registry("quay.io/pypa/manylinux_2_28_x86_64", add_python="3.12")
    .run_commands("dnf install -y bison flex patchelf pkgconf-pkg-config",
                  "/opt/python/cp312-cp312/bin/pip install ninja==1.13.0 cmake==3.31.6 meson==1.7.0 mako pyyaml packaging",
                  "curl -fL https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-x64.tar.xz -o /tmp/node.tar.xz && echo 'cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008  /tmp/node.tar.xz' | sha256sum -c - && tar -C /usr/local --strip-components=1 -xf /tmp/node.tar.xz && rm /tmp/node.tar.xz",
                  "curl -fL https://go.dev/dl/go1.24.2.linux-amd64.tar.gz -o /tmp/go.tar.gz && echo '68097bd680839cbc9d464a0edce4f7c333975e27a90246890e9f1078c7e702ad  /tmp/go.tar.gz' | sha256sum -c - && tar -C /usr/local -xzf /tmp/go.tar.gz && rm /tmp/go.tar.gz")
    .env({"PATH": "/opt/python/cp312-cp312/bin:/opt/rh/gcc-toolset-14/root/usr/bin:/usr/local/go/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"})
    .add_local_dir(ROOT / "native", "/repo/native", ignore=["__pycache__"])
    .add_local_dir(ROOT / "deps", "/repo/deps", ignore=["__pycache__"])
    .add_local_file(ROOT / "package.json", "/repo/package.json")
    .add_local_file(ROOT / "LICENSE", "/repo/LICENSE")
    .add_local_file(ROOT / "THIRD_PARTY_NOTICES", "/repo/THIRD_PARTY_NOTICES")
)


@app.function(image=image, cpu=4, memory=16384, timeout=14400, volumes={"/build": volume})
def build():
    output = "/build/linux-x64"
    for command in [
        ["python", "/repo/native/build.py", "/build/manylinux-source", output],
        ["python", "/repo/deps/mesa.py", output, "--work", "/build/mesa-source"],
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
