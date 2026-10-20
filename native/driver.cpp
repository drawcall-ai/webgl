    auto directory = GetModuleDirectory();
    DAWN_INVALID_IF(!directory.has_value(), "Couldn't locate the bundled Vulkan driver directory");
#if DAWN_PLATFORM_IS(WINDOWS)
    constexpr char driverName[] = "vulkan_lvp.dll";
#elif DAWN_PLATFORM_IS(MACOS)
    constexpr char driverName[] = "libvulkan_lvp.dylib";
#else
    constexpr char driverName[] = "libvulkan_lvp.so";
#endif
    std::string driverError;
    DAWN_INVALID_IF(!mDriverLib.Open(*directory + driverName, &driverError),
                    "Couldn't load the bundled Vulkan driver: %s", driverError);
    DAWN_INVALID_IF(!mDriverLib.GetProc(&mDriverGetInstanceProcAddr,
                                       "vk_icdGetInstanceProcAddr", &driverError),
                    "Couldn't load the bundled Vulkan driver entrypoint: %s", driverError);

    VulkanFunctions driverFunctions = mFunctions;
    driverFunctions.EnumerateInstanceExtensionProperties =
        reinterpret_cast<PFN_vkEnumerateInstanceExtensionProperties>(
            mDriverGetInstanceProcAddr(VK_NULL_HANDLE, "vkEnumerateInstanceExtensionProperties"));
    driverFunctions.EnumerateInstanceVersion = reinterpret_cast<PFN_vkEnumerateInstanceVersion>(
        mDriverGetInstanceProcAddr(VK_NULL_HANDLE, "vkEnumerateInstanceVersion"));
    DAWN_INVALID_IF(driverFunctions.EnumerateInstanceExtensionProperties == nullptr ||
                        driverFunctions.EnumerateInstanceVersion == nullptr,
                    "The bundled Vulkan driver is missing global entrypoints");
    DAWN_TRY_ASSIGN(mGlobalInfo, GatherGlobalInfo(mFunctions, &driverFunctions));
