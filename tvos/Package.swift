// swift-tools-version: 5.9
//
// The Apple TV app's core (PLAN.md 12-tv-apple): everything the app does that is not
// drawing or decoding, kept in a package so it builds and is checked with the Command
// Line Tools alone, on any Mac, without Xcode or the tvOS SDK. The app target itself
// (SwiftUI, the video view, LiveKit's WebRTC) lives in tvos/App and links this.
//
// `npm run tvswift` builds it and runs `cgtv-probe` against the licence Worker's real
// `/tv/` handler (scripts/tvswift.mjs), so the Swift client and the JavaScript server
// are proven against each other, not each against its own idea of the other.
//
// On Apple's systems the core signs and verifies with CryptoKit. Linux, where the
// Measure shards run that check, has no CryptoKit, so there and only there the core
// builds Apple's swift-crypto, the same API over BoringSSL. The tvOS app never links it.

import PackageDescription

let package = Package(
    name: "ChromaGlassTV",
    platforms: [.macOS(.v13), .tvOS(.v16)],
    products: [
        .library(name: "ChromaGlassTVCore", targets: ["ChromaGlassTVCore"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-crypto.git", exact: "3.15.1"),
    ],
    targets: [
        .target(name: "ChromaGlassTVCore", dependencies: [
            .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux])),
        ]),
        .executableTarget(name: "cgtv-probe", dependencies: [
            "ChromaGlassTVCore",
            .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux])),
        ]),
    ]
)
