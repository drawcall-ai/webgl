"""Bundle the exact portable Mesa release used by the cold-render benchmarks."""
import hashlib
import platform
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

VERSION = "25.0.7-vgpu.1"
CHECKSUMS = {
    "x64": "8c97d7b8b9ac1598dbedf30f23cdf37eb6ae5f2b062e38b7d8bb7d84549a5b82",
    "arm64": "eac1477d6404af2d63fc08104e980d0cbbf657470c966a0bc638099c00d3dcac",
}


def install(output):
    architecture = {"x86_64": "x64", "aarch64": "arm64"}.get(platform.machine())
    if platform.system() != "Linux" or architecture not in CHECKSUMS:
        raise RuntimeError("The Mesa bundle supports Linux x64 and arm64")
    url = f"https://github.com/vercel-labs/vgpu/releases/download/lavapipe-v{VERSION}/mesa-lavapipe-25.0.7-linux-{architecture}.tar.gz"
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        archive = Path(temporary) / "mesa.tar.gz"
        subprocess.run(["curl", "-fL", "--retry", "3", url, "-o", str(archive)], check=True)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != CHECKSUMS[architecture]:
            raise RuntimeError("Mesa archive checksum mismatch")
        with tarfile.open(archive) as bundle:
            if {m.name for m in bundle.getmembers()} != {"libvulkan_lvp.so", "lvp_icd.json"}:
                raise RuntimeError("Unexpected files in Mesa archive")
            bundle.extractall(output, filter="data")


if __name__ == "__main__":
    install(Path(sys.argv[1]))
