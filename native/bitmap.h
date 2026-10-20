#pragma once
#include "src/dawn/node/interop/WebGPU.h"
#include <cstdint>
#include <vector>
namespace wgpu::binding {
class ImageBitmap final : public interop::ImageBitmap {
public:
  ImageBitmap(uint32_t width, uint32_t height, std::vector<uint8_t> pixels,
              bool premultiplied)
      : width_(width), height_(height), pixels_(std::move(pixels)),
        premultiplied_(premultiplied) {}
  uint32_t getWidth(Napi::Env) override { return width_; }
  uint32_t getHeight(Napi::Env) override { return height_; }
  void close(Napi::Env) override {
    width_ = height_ = 0;
    pixels_.clear();
    pixels_.shrink_to_fit();
  }
  uint32_t width_ = 0, height_ = 0;
  std::vector<uint8_t> pixels_;
  bool premultiplied_ = false;
};
} // namespace wgpu::binding
