// swift-tools-version: 5.9
//
// The Apple TV app's video link (PLAN.md 12-tv-apple): the PeerLink over LiveKit's build of
// Google's WebRTC, the one maintained WebRTC that ships a tvOS slice. It is a package of its
// own, not part of tvos/Package.swift, because the WebRTC binary is an xcframework that
// Linux cannot link, and the core must keep building on the Linux Measure shard.
//
// It builds with the Command Line Tools on a Mac against the xcframework's macOS slice, so
// the WebRTC calls are type-checked before Xcode is installed (`swift build` here); the
// tvOS app target in tvos/App links the same code against the tvOS slice.

import PackageDescription

let package = Package(
    name: "ChromaGlassTVVideo",
    platforms: [.macOS(.v13), .tvOS(.v16)],
    products: [
        .library(name: "ChromaGlassTVVideo", targets: ["ChromaGlassTVVideo"]),
    ],
    dependencies: [
        .package(path: ".."),
        .package(url: "https://github.com/livekit/webrtc-xcframework.git", exact: "150.7871.05"),
    ],
    targets: [
        .target(name: "ChromaGlassTVVideo", dependencies: [
            .product(name: "ChromaGlassTVCore", package: "tvos"),
            .product(name: "LiveKitWebRTC", package: "webrtc-xcframework"),
        ]),
        // `npm run tvvideo`: the receiver playing a real stream from a Chromium page.
        .executableTarget(name: "cgtv-video-probe", dependencies: [
            "ChromaGlassTVVideo",
            .product(name: "ChromaGlassTVCore", package: "tvos"),
            .product(name: "LiveKitWebRTC", package: "webrtc-xcframework"),
        ]),
    ]
)
