from pathlib import Path


def patch(root):
    """Enable the native image and driver boundaries without changing GPU validation."""
    here = Path(__file__).parent
    node = root / "src/dawn/node"
    names = ["interop/Browser.idl", "Module.cpp", "binding/GPUQueue.h",
             "binding/GPUQueue.cpp", "binding/GPUDevice.cpp", "../native/vulkan/BackendVk.cpp"]
    sources = {}
    for name in names:
        path = node / name
        original = path.with_suffix(path.suffix + ".platform-original")
        if not original.exists():
            original.write_bytes(path.read_bytes())
        sources[name] = original.read_text()

    def change(name, old, new):
        source = sources[name]
        if source.count(old) != 1:
            raise RuntimeError(f"Dawn patch anchor must occur exactly once in {name}: {old}")
        sources[name] = source.replace(old, new)

    change("interop/Browser.idl", "[LegacyNoInterfaceObject] interface ImageBitmap {};",
           "interface ImageBitmap { readonly attribute unsigned long width; "
           "readonly attribute unsigned long height; undefined close(); };")
    sources["binding/ImageBitmap.h"] = (here / "bitmap.h").read_text()
    change("Module.cpp", "#include <filesystem>",
           '#include <filesystem>\n#include <cmath>\n#include "src/dawn/node/binding/ImageBitmap.h"')
    change("Module.cpp", "    return exports;", (here / "factory.cpp").read_text() + "\n    return exports;")
    change("binding/GPUQueue.h", "GPUQueue(wgpu::Queue queue,", "GPUQueue(wgpu::Device device, wgpu::Queue queue,")
    change("binding/GPUQueue.h", "    wgpu::Queue queue_;", "    wgpu::Device device_;\n    wgpu::Queue queue_;")
    change("binding/GPUQueue.cpp", '#include "src/dawn/node/binding/GPUBuffer.h"',
           '#include "src/dawn/node/binding/GPUBuffer.h"\n'
           '#include "src/dawn/node/binding/ImageBitmap.h"\n'
           '#include "src/dawn/node/binding/Errors.h"')
    change("binding/GPUQueue.cpp", "GPUQueue::GPUQueue(wgpu::Queue queue,",
           "GPUQueue::GPUQueue(wgpu::Device device, wgpu::Queue queue,")
    change("binding/GPUQueue.cpp", ": queue_(std::move(queue))",
           ": device_(std::move(device)), queue_(std::move(queue))")
    change("binding/GPUQueue.cpp", "    UNIMPLEMENTED(env);", (here / "queue.cpp").read_text())
    change("binding/GPUDevice.cpp", "env, device_.GetQueue(), async_", "env, device_, device_.GetQueue(), async_")
    # Our bundled Vulkan loader and Mesa driver are available on macOS too.
    change("../native/vulkan/BackendVk.cpp", """#if DAWN_PLATFORM_IS(MACOS)
        // On Mac, we don't expect non-Swiftshader Vulkan to be available.
        if (icd == ICD::None) {
            continue;
        }
#endif  // DAWN_PLATFORM_IS(MACOS)
""", "")
    for name, contents in sources.items():
        path = node / name
        if not path.exists() or path.read_text() != contents:
            path.write_text(contents)
