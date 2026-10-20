exports.Set(
    "createImageBitmapFromRGBA",
    Napi::Function::New(env, [](const Napi::CallbackInfo &info) -> Napi::Value {
      auto env = info.Env();
      if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsNumber() ||
          !info[2].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected width, height, Uint8Array")
            .ThrowAsJavaScriptException();
        return env.Undefined();
      }
      double w = info[0].As<Napi::Number>().DoubleValue(),
             h = info[1].As<Napi::Number>().DoubleValue();
      auto array = info[2].As<Napi::TypedArray>();
      if (!std::isfinite(w) || !std::isfinite(h) || w < 1 || h < 1 ||
          w > 16384 || h > 16384 || std::floor(w) != w || std::floor(h) != h ||
          array.TypedArrayType() != napi_uint8_array ||
          array.ByteLength() != uint64_t(w) * uint64_t(h) * 4) {
        Napi::TypeError::New(env, "Invalid RGBA8 dimensions or byte length")
            .ThrowAsJavaScriptException();
        return env.Undefined();
      }
      bool premultiplied = false;
      if (info.Length() > 3 && !info[3].IsUndefined()) {
        if (!info[3].IsObject()) {
          Napi::TypeError::New(env, "Invalid bitmap metadata")
              .ThrowAsJavaScriptException();
          return env.Undefined();
        }
        auto options = info[3].As<Napi::Object>();
        premultiplied = options.Has("premultipliedAlpha") &&
                        options.Get("premultipliedAlpha").ToBoolean().Value();
        if ((options.Has("colorSpace") &&
             options.Get("colorSpace").ToString().Utf8Value() != "srgb")) {
          Napi::TypeError::New(env, "Only sRGB bitmap backing is implemented")
              .ThrowAsJavaScriptException();
          return env.Undefined();
        }
      }
      auto bytes = info[2].As<Napi::Uint8Array>();
      std::vector<uint8_t> owned(bytes.Data(),
                                 bytes.Data() + bytes.ElementLength());
      return wgpu::interop::ImageBitmap::Create<wgpu::binding::ImageBitmap>(
          env, static_cast<uint32_t>(w), static_cast<uint32_t>(h),
          std::move(owned), premultiplied);
    }));
