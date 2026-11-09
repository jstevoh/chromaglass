# The DAW bridge plugin (PLAN 13.7b, docs/dawbridge.md): an AU effect and a VST3 for
# Logic and Ableton Live, and DawBridgeSelfTest, the console target the check runs.
#
#   cmake -S plugin/dawbridge -B plugin/dawbridge/build -DCMAKE_BUILD_TYPE=Release
#   cmake --build plugin/dawbridge/build --config Release -j
#
# The build directory is where `npm run dawbridge -- --plugin` looks for the self-test,
# so keep it `plugin/dawbridge/build` (git-ignored). -DDAWBRIDGE_INSTALL=ON copies the
# AU and the VST3 into ~/Library/Audio/Plug-Ins after the build, which auval and the
# DAWs need; the macOS runner (13.7c) signs them where they are built instead.
#
# JUCE is fetched at a pinned tag into the build directory, so a clone of this repo needs
# only CMake and a compiler (Xcode's command line tools are enough on a Mac).

cmake_minimum_required(VERSION 3.22)

set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "The oldest macOS the plugin loads on")
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "Universal: Apple silicon and Intel")

project(DawBridge VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(DAWBRIDGE_INSTALL "Copy the AU and VST3 into ~/Library/Audio/Plug-Ins after building" OFF)

include(FetchContent)
FetchContent_Declare(JUCE
  GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
  GIT_TAG 8.0.15
  GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(JUCE)

juce_add_plugin(DawBridge
  PRODUCT_NAME "ChromaGlass Bridge"
  COMPANY_NAME "ChromaGlass"
  BUNDLE_ID art.chromaglass.dawbridge
  PLUGIN_MANUFACTURER_CODE Pltr
  PLUGIN_CODE Cgbr
  FORMATS AU VST3
  IS_SYNTH FALSE
  NEEDS_MIDI_INPUT FALSE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  AU_MAIN_TYPE kAudioUnitType_Effect
  VST3_CATEGORIES Fx Analyzer
  COPY_PLUGIN_AFTER_BUILD ${DAWBRIDGE_INSTALL})

set(DAWBRIDGE_SOURCES Source/PluginProcessor.cpp Source/PluginEditor.cpp)
set(DAWBRIDGE_DEFINITIONS JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0
  JUCE_DISPLAY_SPLASH_SCREEN=0)

target_sources(DawBridge PRIVATE ${DAWBRIDGE_SOURCES})
target_compile_definitions(DawBridge PUBLIC ${DAWBRIDGE_DEFINITIONS})
target_link_libraries(DawBridge
  PRIVATE juce::juce_audio_utils juce::juce_osc
  PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags
         juce::juce_recommended_warning_flags)

# The self-test compiles the same processor sources the plugin does and plays them as a
# host would, so what the check measures is the plugin's code, not a copy of it.
juce_add_console_app(DawBridgeSelfTest PRODUCT_NAME "DawBridgeSelfTest")
target_sources(DawBridgeSelfTest PRIVATE SelfTest/SelfTestMain.cpp ${DAWBRIDGE_SOURCES})
target_compile_definitions(DawBridgeSelfTest PRIVATE ${DAWBRIDGE_DEFINITIONS} DAWBRIDGE_SELFTEST=1)
target_link_libraries(DawBridgeSelfTest
  PRIVATE juce::juce_audio_utils juce::juce_osc
          juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
