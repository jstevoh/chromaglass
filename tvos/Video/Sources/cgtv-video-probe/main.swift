import ChromaGlassTVCore
import ChromaGlassTVVideo
import Foundation
import LiveKitWebRTC

// The video link's probe (`npm run tvvideo`, scripts/tvvideo.mjs). It runs the Apple TV
// app's real receiver, ReceiverDriver over LiveKitPeer, on the Mac against LiveKit's macOS
// slice of the same WebRTC build, and plays a stream that a Chromium page sends through a
// stand-in relay, the way the Mac's show sends the plate (PLAN.md 12-tv-apple). What it
// proves the core's probe cannot: that the offer a browser makes is taken, the answer and
// candidates go back in the form the browser takes, and decoded pictures arrive.
//
// Pictures, not frame callbacks: the page's canvas flips between near-black and near-white
// every half second, and the probe reads the brightness at the middle of each decoded
// frame. A link that delivered empty or frozen frames would count frames and still fail
// the swing; one that delivered nothing would never reach "live".

setvbuf(stdout, nil, _IOLBF, 0)

guard let raw = ProcessInfo.processInfo.environment["CGTV_TV_ADDRESS"],
      let address = RelayAddress(tvAddress: raw)
else { print("FAIL no CGTV_TV_ADDRESS"); exit(2) }

/// Reads each frame's size and the mean luma of a patch at its middle. WebRTC calls it on
/// its decoding thread.
final class Meter: NSObject, LKRTCVideoRenderer, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var frames = 0
    private(set) var size = (0, 0)
    private(set) var lumaMin = 255.0
    private(set) var lumaMax = 0.0

    func setSize(_ size: CGSize) {}
    func renderFrame(_ frame: LKRTCVideoFrame?) {
        guard let frame else { return }
        let i420 = frame.buffer.toI420()
        let w = Int(i420.width), h = Int(i420.height), stride = Int(i420.strideY)
        var sum = 0.0, n = 0.0
        for y in (h / 2 - 8)..<(h / 2 + 8) {
            for x in (w / 2 - 8)..<(w / 2 + 8) { sum += Double(i420.dataY[y * stride + x]); n += 1 }
        }
        let mean = sum / n
        lock.lock()
        frames += 1
        size = (w, h)
        lumaMin = min(lumaMin, mean)
        lumaMax = max(lumaMax, mean)
        lock.unlock()
    }

    func read() -> (frames: Int, w: Int, h: Int, lo: Double, hi: Double) {
        lock.lock(); defer { lock.unlock() }
        return (frames, size.0, size.1, lumaMin, lumaMax)
    }
}

@MainActor
func run() async -> Int32 {
    var failures = 0
    func check(_ ok: Bool, _ what: String) {
        print(ok ? "ok   \(what)" : "FAIL \(what)")
        if !ok { failures += 1 }
    }

    let meter = Meter()
    let peer = LiveKitPeer()
    var screens: [TvScreen] = []
    var liveAt: Date?
    peer.onTrack = { track in track?.add(meter) }
    let driver = ReceiverDriver(address: address, peer: peer)
    driver.onScreen = { s in
        screens.append(s)
        if s == .live && liveAt == nil { liveAt = Date() }
    }
    let started = Date()
    driver.start()

    // Up to 20 s to go live (software encoding in a headless page is slow to start), then
    // 3 s of pictures.
    while liveAt == nil && Date().timeIntervalSince(started) < 20 {
        try? await Task.sleep(nanoseconds: 100_000_000)
    }
    check(liveAt != nil, "the receiver went live (screens \(screens))")
    if let liveAt {
        print(String(format: "     live %.1f s after the socket opened", liveAt.timeIntervalSince(started)))
        let before = meter.read().frames
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        let m = meter.read()
        let rate = Double(m.frames - before) / 3
        check(rate >= 10, String(format: "pictures keep coming: %.0f a second over 3 s (at least 10)", rate))
        check(m.w == 640 && m.h == 360, "the picture is the page's 640×360 (got \(m.w)×\(m.h))")
        check(m.lo < 60 && m.hi > 190, String(format: "the pictures are the page's, dark and light: luma %.0f to %.0f (below 60 and above 190)", m.lo, m.hi))
    }
    driver.stop()
    print(failures == 0 ? "video probe: all checks pass" : "video probe: \(failures) failed")
    return failures == 0 ? 0 : 1
}

let code = await run()
exit(code)
