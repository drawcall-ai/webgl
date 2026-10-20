auto *image =
    std::get_if<interop::Interface<interop::ImageBitmap>>(&source.source);
if (!image) {
  Napi::TypeError::New(env, "Only native ImageBitmap sources are implemented")
      .ThrowAsJavaScriptException();
  return;
}
auto *bitmap = image->As<ImageBitmap>();
if (bitmap->pixels_.empty()) {
  Errors::InvalidStateError(env, "ImageBitmap is closed")
      .ThrowAsJavaScriptException();
  return;
}
wgpu::TexelCopyTextureInfo dst{};
wgpu::Extent3D size{};
Converter conv(env);
if (!conv(dst, destination) || !conv(size, copySize))
  return;
uint32_t x = 0, y = 0;
bool originValid = true;
std::visit(
    [&](auto &&origin) {
      using T = std::decay_t<decltype(origin)>;
      if constexpr (std::is_same_v<T, interop::GPUOrigin2DDict>) {
        x = origin.x;
        y = origin.y;
      } else {
        originValid = origin.size() <= 2;
        if (origin.size() > 0)
          x = origin[0];
        if (origin.size() > 1)
          y = origin[1];
      }
    },
    source.origin);
if (!originValid) {
  Napi::TypeError::New(env, "GPUOrigin2D must have at most two elements")
      .ThrowAsJavaScriptException();
  return;
}
if (size.depthOrArrayLayers > 1 || uint64_t(x) + size.width > bitmap->width_ ||
    uint64_t(y) + size.height > bitmap->height_) {
  Errors::OperationError(env, "External image copy bounds are invalid")
      .ThrowAsJavaScriptException();
  return;
}
// WebGPU external-image destination formats are narrower than Dawn internal
// copies.
switch (dst.texture.GetFormat()) {
case wgpu::TextureFormat::R8Unorm:
case wgpu::TextureFormat::R16Float:
case wgpu::TextureFormat::R16Unorm:
case wgpu::TextureFormat::R32Float:
case wgpu::TextureFormat::RG8Unorm:
case wgpu::TextureFormat::RG16Float:
case wgpu::TextureFormat::RG16Unorm:
case wgpu::TextureFormat::RG32Float:
case wgpu::TextureFormat::RGBA8Unorm:
case wgpu::TextureFormat::RGBA8UnormSrgb:
case wgpu::TextureFormat::BGRA8Unorm:
case wgpu::TextureFormat::BGRA8UnormSrgb:
case wgpu::TextureFormat::RGB10A2Unorm:
case wgpu::TextureFormat::RG11B10Ufloat:
case wgpu::TextureFormat::RGBA16Float:
case wgpu::TextureFormat::RGBA16Unorm:
case wgpu::TextureFormat::RGBA32Float:
  break;
default:
  device_.InjectError(wgpu::ErrorType::Validation,
                      "Unsupported external image destination format");
  return;
}
// An identity external copy is byte-preserving, including sRGB storage.
// WriteTexture validates device ownership, liveness, mip/origin bounds and
// CopyDst. Keep the stricter external-copy requirements here; every other case
// uses Dawn's helper.
const auto usage = dst.texture.GetUsage();
const bool identity =
    x == 0 && y == 0 && size.width == bitmap->width_ &&
    size.height == bitmap->height_ && size.depthOrArrayLayers == 1 &&
    !source.flipY &&
    destination.colorSpace == interop::PredefinedColorSpace::kSrgb &&
    bitmap->premultiplied_ == destination.premultipliedAlpha &&
    (dst.texture.GetFormat() == wgpu::TextureFormat::RGBA8Unorm ||
     dst.texture.GetFormat() == wgpu::TextureFormat::RGBA8UnormSrgb) &&
    dst.texture.GetDimension() == wgpu::TextureDimension::e2D &&
    dst.texture.GetSampleCount() == 1 &&
    dst.aspect == wgpu::TextureAspect::All &&
    (usage & wgpu::TextureUsage::CopyDst) != wgpu::TextureUsage::None &&
    (usage & wgpu::TextureUsage::RenderAttachment) != wgpu::TextureUsage::None;
if (identity) {
  wgpu::TexelCopyBufferLayout directLayout{};
  directLayout.bytesPerRow = bitmap->width_ * 4;
  directLayout.rowsPerImage = bitmap->height_;
  queue_.WriteTexture(&dst, bitmap->pixels_.data(), bitmap->pixels_.size(),
                      &directLayout, &size);
  return;
}
wgpu::TextureDescriptor desc{};
desc.size = {bitmap->width_, bitmap->height_, 1};
desc.format = wgpu::TextureFormat::RGBA8Unorm;
desc.usage = wgpu::TextureUsage::CopyDst | wgpu::TextureUsage::CopySrc |
             wgpu::TextureUsage::TextureBinding;
auto texture = device_.CreateTexture(&desc);
wgpu::TexelCopyTextureInfo src{};
src.texture = texture;
wgpu::TexelCopyBufferLayout layout{};
layout.bytesPerRow = bitmap->width_ * 4;
layout.rowsPerImage = bitmap->height_;
queue_.WriteTexture(&src, bitmap->pixels_.data(), bitmap->pixels_.size(),
                    &layout, &desc.size);
src.origin = {x, y, 0};
wgpu::CopyTextureForBrowserOptions options{};
options.flipY = source.flipY;
options.srcAlphaMode = bitmap->premultiplied_
                           ? wgpu::AlphaMode::Premultiplied
                           : wgpu::AlphaMode::Unpremultiplied;
options.dstAlphaMode = destination.premultipliedAlpha
                           ? wgpu::AlphaMode::Premultiplied
                           : wgpu::AlphaMode::Unpremultiplied;
// Dawn parameters are G,A,B,C,D,E,F; WGSL matrices use column-major order.
// Both spaces use the sRGB transfer function. Gamut conversion is
// XYZ_to_lin_P3 * lin_sRGB_to_XYZ from W3C css-color-4/conversions.js.
static constexpr float decode[7] = {
    2.4f, 1.0f / 1.055f, 0.055f / 1.055f, 1.0f / 12.92f, 0.04045f, 0, 0};
static constexpr float encode[7] = {1.0f / 2.4f, 1.137118965825f, 0, 12.92f,
                                    0.0031308f,  -0.055f,         0};
static constexpr float srgbToP3[9] = {
    0.822461968714f,
    0.033194198851f,
    0.017082630721f,
    0.177538031286f,
    0.966805801149f,
    0.072397440664f,
    0,
    0,
    0.910519928615f,
};
if (destination.colorSpace == interop::PredefinedColorSpace::kDisplayP3) {
  options.needsColorSpaceConversion = true;
  options.srcTransferFunctionParameters = decode;
  options.dstTransferFunctionParameters = encode;
  options.conversionMatrix = srgbToP3;
}
queue_.CopyTextureForBrowser(&src, &dst, &size, &options);
