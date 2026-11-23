import AVFoundation
import Combine
import SwiftUI

/// The calm loops (PLAN 12-tv-loops-2): six silent half-hour films the Apple TV plays round
/// and round with no Mac, no licence and no sign-in.
///
/// The owner asked for them, 2026-11-14: "audio free visuals that the appletv and googletv
/// apps can use … 30 minute loops that evolve over time and are calming", and approved the
/// six that were made, 2026-11-15. Each is the app's own Render a song of one calm look with
/// Evolve on and nothing heard; how they are made and judged is src/lib/tvLoops.ts, the list
/// this one must match (`npm run presskit` holds this file, the Google TV app's Loops.java and
/// tvLoops.ts the same). Each file's last twenty seconds are crossfaded into its first, so
/// AVPlayerLooper comes round on the file's own seam with no cut.
///
/// Why they need no pass, when the live picture does: they are the website's free films
/// played from the website's address, not the show, which is the Home and Pro feature. They
/// are also what App Review sees (12-tv-apple-9): a reviewer has neither a Mac nor a licence,
/// and an app that only showed a code screen would be turned away for showing nothing.
///
/// One loop round and round, not the six in turn: one look is calm, a cut from one liquid to
/// another every half hour is not. Left and right on the remote step to another, Menu goes
/// back, and the loop played last plays first next time.
enum CalmLoops {
    struct Loop: Equatable {
        let id: String
        let title: String
        var url: URL { URL(string: CalmLoops.origin + id + ".mp4")! }
    }

    /// The website's address, which firebase.json sends on to the pre-release `tv-loops-1`
    /// with a 302 that AVPlayer follows, so the files can move without a new app.
    static let origin = "https://chromaglass.art/loops/"

    static let all: [Loop] = [
        Loop(id: "chemical-clock", title: "Chemical Clock"),
        Loop(id: "clock-glass", title: "Clock Glass"),
        Loop(id: "aurora-borealis", title: "Aurora Borealis"),
        Loop(id: "jellyfish-bloom", title: "Jellyfish Bloom"),
        Loop(id: "velvet-underground", title: "Velvet Underground"),
        Loop(id: "lava-lamp", title: "Lava Lamp"),
    ]

    /// Round and round either way: the remote never meets an end.
    static func step(_ i: Int, by: Int) -> Int {
        let n = all.count
        return ((i + by) % n + n) % n
    }

    /// The kept loop's place, or the first for none or one taken out since it was kept.
    static func index(of id: String?) -> Int {
        all.firstIndex { $0.id == id } ?? 0
    }
}

/// The loops full screen: the film, a spinner until its first frame, and a line naming the
/// loop that fades after a few seconds, so nothing stays over a calm picture.
struct CalmLoopsView: View {
    let onClose: () -> Void
    @StateObject private var player = LoopPlayer()
    @AppStorage("calmLoop") private var kept = ""
    @State private var at = 0
    @State private var captionShown = true
    @State private var captionTask: Task<Void, Never>?

    var body: some View {
        ZStack {
            Color.black
            PlayerLayerView(player: player.queue)
            if !player.playing && !player.failed {
                ProgressView()
            }
            if player.failed {
                Text("Could not play the calm loops. Is this TV on the internet?")
                    .font(.title2).foregroundStyle(.white.opacity(0.8))
                    .padding(40).background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
            }
            VStack(alignment: .leading, spacing: 6) {
                Spacer()
                Text(CalmLoops.all[at].title).font(.title3).bold()
                Text("Calm loop \(at + 1) of \(CalmLoops.all.count)  ·  ◀ ▶ another loop  ·  Menu to go back")
                    .font(.callout)
            }
            .foregroundStyle(.white.opacity(0.85))
            .shadow(color: .black, radius: 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(60)
            .opacity(captionShown ? 1 : 0)
            .animation(.easeOut(duration: 1.2), value: captionShown)
        }
        .ignoresSafeArea()
        .focusable(true)
        .onMoveCommand { direction in
            switch direction {
            case .left: play(CalmLoops.step(at, by: -1))
            case .right: play(CalmLoops.step(at, by: 1))
            default: showCaption()
            }
        }
        .onExitCommand { onClose() }
        .onAppear {
            // A silent half hour with nobody touching the remote: the screensaver must not come.
            UIApplication.shared.isIdleTimerDisabled = true
            play(CalmLoops.index(of: kept))
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            captionTask?.cancel()
            player.stop()
        }
    }

    private func play(_ i: Int) {
        at = i
        kept = CalmLoops.all[i].id
        player.play(CalmLoops.all[i].url)
        showCaption()
    }

    private func showCaption() {
        captionShown = true
        captionTask?.cancel()
        captionTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            if !Task.isCancelled { captionShown = false }
        }
    }
}

/// AVQueuePlayer with AVPlayerLooper: the looper keeps the next copy of the film queued, so
/// the half hour comes round with no gap on the file's own crossfaded seam. Muted though the
/// files have no sound, so nothing a file might carry is ever heard.
@MainActor
final class LoopPlayer: ObservableObject {
    let queue = AVQueuePlayer()
    @Published private(set) var playing = false
    @Published private(set) var failed = false
    private var looper: AVPlayerLooper?
    private var watching: AnyCancellable?
    private var watchingLooper: AnyCancellable?

    init() {
        queue.isMuted = true
        watching = queue.publisher(for: \.timeControlStatus)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in if $0 == .playing { self?.playing = true } }
    }

    func play(_ url: URL) {
        stop()
        playing = false
        failed = false
        let l = AVPlayerLooper(player: queue, templateItem: AVPlayerItem(url: url))
        watchingLooper = l.publisher(for: \.status)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in if $0 == .failed { self?.failed = true } }
        looper = l
        queue.play()
    }

    func stop() {
        watchingLooper = nil
        looper?.disableLooping()
        looper = nil
        queue.pause()
        queue.removeAllItems()
    }
}

/// AVPlayerLayer in a view: the picture and nothing else (AVKit's VideoPlayer would put its
/// transport bar over the loop at a touch of the remote).
struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> LayerView {
        let v = LayerView()
        v.playerLayer.player = player
        v.playerLayer.videoGravity = .resizeAspect
        return v
    }

    func updateUIView(_ view: LayerView, context: Context) {}

    final class LayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
