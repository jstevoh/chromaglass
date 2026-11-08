/*
 * ChromaGlass native Syphon output add-on (macOS).
 *
 * Publishes a SyphonMetalServer named "ChromaGlass" directly from Electron's
 * offscreen shared GPU texture (IOSurfaceRef), with no CPU readback.
 *
 * Linked against the official Syphon framework (BSD 3-Clause, vendor/Syphon.framework/License.txt).
 */

#import <Cocoa/Cocoa.h>
#import <IOSurface/IOSurface.h>
#import <Metal/Metal.h>
#import <Syphon/Syphon.h>
#include <node_api.h>
#include <stdint.h>
#include <string.h>

static id<MTLDevice> g_device = nil;
static id<MTLCommandQueue> g_commandQueue = nil;
static SyphonMetalServer *g_server = nil;
static uint64_t g_published = 0;

static napi_value StartServer(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);

    char nameBuf[256] = "ChromaGlass";
    if (argc >= 1) {
      napi_valuetype valType;
      if (napi_typeof(env, argv[0], &valType) == napi_ok && valType == napi_string) {
        size_t copied = 0;
        napi_get_value_string_utf8(env, argv[0], nameBuf, sizeof(nameBuf), &copied);
      }
    }
    NSString *requestedName = [NSString stringWithUTF8String:nameBuf];
    if (!requestedName || requestedName.length == 0) {
      requestedName = @"ChromaGlass";
    }

    if (g_server != nil) {
      if ([g_server.name isEqualToString:requestedName]) {
        napi_value res;
        napi_get_boolean(env, true, &res);
        return res;
      }
      [g_server stop];
      g_server = nil;
    }

    if (g_device == nil) {
      g_device = MTLCreateSystemDefaultDevice();
    }
    if (g_device == nil) {
      napi_value res;
      napi_get_boolean(env, false, &res);
      return res;
    }
    if (g_commandQueue == nil) {
      g_commandQueue = [g_device newCommandQueue];
    }
    if (g_commandQueue == nil) {
      napi_value res;
      napi_get_boolean(env, false, &res);
      return res;
    }

    g_server = [[SyphonMetalServer alloc] initWithName:requestedName device:g_device options:nil];
    napi_value res;
    napi_get_boolean(env, g_server != nil, &res);
    return res;
  }
}

static napi_value StopServer(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    (void)info;
    if (g_server != nil) {
      [g_server stop];
      g_server = nil;
    }
    napi_value res;
    napi_get_boolean(env, true, &res);
    return res;
  }
}

static napi_value PublishIOSurface(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);

    if (argc < 1 || g_server == nil || g_device == nil || g_commandQueue == nil) {
      napi_value res;
      napi_get_boolean(env, false, &res);
      return res;
    }

    bool isBuffer = false;
    napi_is_buffer(env, argv[0], &isBuffer);
    if (!isBuffer) {
      napi_value res;
      napi_get_boolean(env, false, &res);
      return res;
    }

    void *data = NULL;
    size_t byteLength = 0;
    if (napi_get_buffer_info(env, argv[0], &data, &byteLength) != napi_ok || !data || byteLength < sizeof(uintptr_t)) {
      napi_value res;
      napi_get_boolean(env, false, &res);
      return res;
    }

    uintptr_t rawPtr = 0;
    memcpy(&rawPtr, data, sizeof(uintptr_t));
    if (rawPtr == 0) {
      napi_value res;
      napi_get_boolean(env, false, &res);
      return res;
    }

    IOSurfaceRef surface = (IOSurfaceRef)rawPtr;
    size_t width = IOSurfaceGetWidth(surface);
    size_t height = IOSurfaceGetHeight(surface);
    if (width == 0 || height == 0) {
      napi_value res;
      napi_get_boolean(env, false, &res);
      return res;
    }

    MTLTextureDescriptor *desc = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatBGRA8Unorm
                                                                                    width:width
                                                                                   height:height
                                                                                mipmapped:NO];
    desc.usage = MTLTextureUsageShaderRead;
    id<MTLTexture> tex = [g_device newTextureWithDescriptor:desc iosurface:surface plane:0];
    if (tex == nil) {
      napi_value res;
      napi_get_boolean(env, false, &res);
      return res;
    }

    id<MTLCommandBuffer> cmdBuf = [g_commandQueue commandBuffer];
    if (cmdBuf == nil) {
      napi_value res;
      napi_get_boolean(env, false, &res);
      return res;
    }

    [g_server publishFrameTexture:tex
                  onCommandBuffer:cmdBuf
                      imageRegion:NSMakeRect(0, 0, (CGFloat)width, (CGFloat)height)
                          flipped:NO];
    [cmdBuf commit];
    g_published++;

    napi_value res;
    napi_get_boolean(env, true, &res);
    return res;
  }
}

static napi_value GetState(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    (void)info;
    napi_value obj;
    napi_create_object(env, &obj);

    napi_value servingVal;
    napi_get_boolean(env, g_server != nil, &servingVal);
    napi_set_named_property(env, obj, "serving", servingVal);

    napi_value nameVal;
    if (g_server != nil && g_server.name != nil) {
      const char *utf8 = [g_server.name UTF8String];
      napi_create_string_utf8(env, utf8 ? utf8 : "ChromaGlass", NAPI_AUTO_LENGTH, &nameVal);
    } else {
      napi_get_null(env, &nameVal);
    }
    napi_set_named_property(env, obj, "name", nameVal);

    napi_value pubVal;
    napi_create_double(env, (double)g_published, &pubVal);
    napi_set_named_property(env, obj, "published", pubVal);

    napi_value clientsVal;
    napi_get_boolean(env, g_server != nil && g_server.hasClients, &clientsVal);
    napi_set_named_property(env, obj, "hasClients", clientsVal);

    return obj;
  }
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor props[] = {
    { "start", NULL, StartServer, NULL, NULL, NULL, napi_default, NULL },
    { "stop", NULL, StopServer, NULL, NULL, NULL, napi_default, NULL },
    { "publishIOSurface", NULL, PublishIOSurface, NULL, NULL, NULL, napi_default, NULL },
    { "state", NULL, GetState, NULL, NULL, NULL, napi_default, NULL },
  };
  napi_define_properties(env, exports, sizeof(props) / sizeof(props[0]), props);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
