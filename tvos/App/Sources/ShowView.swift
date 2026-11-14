import ChromaGlassTVCore
import ChromaGlassTVVideo
import LiveKitWebRTC
import SwiftUI

/// The picture: the Mac's plate full screen, and over it only what the /tv page says when
/// there is no picture (TvDisplay.tsx's words, so both TVs read alike). The screen states
/// come from ReceiverMachine; this view draws them and nothing else.
struct ShowView: View {
    let address: RelayAddress
    let onDenied: () -> Void
    @StateObject private var link = ShowLink()

    var body: some View {
        ZStack {
            Color.black
            VideoView(track: link.track)
            if let words = link.words {
                Text(words).font(.title2).foregroundStyle(.white.opacity(0.75))
                    .padding(40).background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
            }
        }
        .onAppear { link.start(address) }
        .onDisappear { link.stop() }
        .onChange(of: link.screen) { if $0 == .denied { onDenied() } }
        // The TV is a picture people watch for an hour: never let it sleep while it plays.
        .onChange(of: link.screen) { UIApplication.shared.isIdleTimerDisabled = ($0 == .live) }
    }
}

@MainActor
final class ShowLink: ObservableObject {
    @Published private(set) var screen: TvScreen = .connecting
    @Published private(set) var track: LKRTCVideoTrack?
    private var driver: ReceiverDriver?
    private let peer = LiveKitPeer()

    func start(_ address: RelayAddress) {
        peer.onTrack = { [weak self] in self?.track = $0 }
        let d = ReceiverDriver(address: address, peer: peer)
        d.onScreen = { [weak self] in self?.screen = $0 }
        driver = d
        d.start()
    }

    func stop() {
        driver?.stop()
        driver = nil
    }

    var words: String? {
        // The /tv page's words (TvDisplay.tsx's SAYS), so the two TVs say the same thing.
        switch screen {
        case .live: return nil
        case .connecting, .waiting, .looking: return "Looking for the show…"
        case .lost: return "The picture did not arrive: starting over"
        case .denied: return "This address has the wrong show key: copy the TV address again from the computer running the show"
        case .locked: return "Too many wrong keys from this network: trying again in a few minutes"
        case .refused(let reason):
            return reason == "full"
                ? "Three TVs are already showing this show"
                : "Playing on a TV needs ChromaGlass Home or Pro on the computer running the show"
        }
    }
}

/// WebRTC's Metal view, which draws the track's frames as they are decoded with no
/// buffering of its own: the jitter buffer inside WebRTC is all the delay there is.
struct VideoView: UIViewRepresentable {
    let track: LKRTCVideoTrack?

    func makeUIView(context: Context) -> LKRTCMTLVideoView {
        let v = LKRTCMTLVideoView(frame: .zero)
        v.videoContentMode = .scaleAspectFit
        return v
    }

    func updateUIView(_ view: LKRTCMTLVideoView, context: Context) {
        if context.coordinator.track !== track {
            context.coordinator.track?.remove(view)
            track?.add(view)
            context.coordinator.track = track
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }
    final class Coordinator { var track: LKRTCVideoTrack? }
}
