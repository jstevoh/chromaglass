import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The peer connection, as the receiver needs it. The app implements it over LiveKit's
/// WebRTC build (tvOS has no WebRTC of its own, PLAN.md 12-tv-apple); the probe implements
/// it with a stand-in that answers at once, so the driver below is checked without video.
///
/// Every report goes back through `report`, on the main actor, carrying the number the
/// driver gave the connection, so a report from one already hung up is dropped.
@MainActor
public protocol PeerLink: AnyObject {
    var report: ((ReceiverEvent) -> Void)? { get set }
    /// Build a fresh connection for `peer` with no ICE servers (the Mac and the TV are on
    /// one network), take the offer, and report `.localAnswer`, then each `.localIce`
    /// and a final `.localIce(nil)`; then `.peerConnected`, `.firstFrame` or
    /// `.peerFailed` as they happen, or `.answerFailed` if the offer cannot be taken.
    func answer(peer: Int, offerSDP: String)
    func addIce(peer: Int, _ candidate: IceCandidate?)
    func hangUp()
}

/// Runs a ReceiverMachine against a real socket to the Mac's relay, a PeerLink and real
/// timers. It does what each action says and nothing more, so the behaviour stays in the
/// machine where `npm run tvswift` checks it.
///
/// The socket is URLSession's WebSocket task. Each socket gets a generation number, and a
/// callback from an older one is dropped: a socket closed on purpose for a restart must
/// not also report a close that would schedule a second reconnect.
@MainActor
public final class ReceiverDriver {
    public private(set) var machine: ReceiverMachine
    public var onScreen: ((TvScreen) -> Void)?
    public let address: RelayAddress
    private let peer: PeerLink
    private var session: URLSession!
    private let delegate = SocketDelegate()
    private var socket: URLSessionWebSocketTask?
    private var generation = 0
    private var stuck: Task<Void, Never>?
    private var pending: Task<Void, Never>?
    private var stopped = false

    public init(address: RelayAddress, peer: PeerLink, timing: ReceiverTiming = ReceiverTiming()) {
        self.address = address
        self.peer = peer
        self.machine = ReceiverMachine(key: address.key, timing: timing)
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        self.session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
        delegate.opened = { [weak self] task in
            Task { @MainActor in
                guard let self, task === self.socket else { return }
                self.handle(.socketOpened)
            }
        }
        peer.report = { [weak self] event in self?.handle(event) }
    }

    public var screen: TvScreen { machine.screen }

    public func start() {
        stopped = false
        open()
    }

    /// Leaves the show: the app going to the background, or the player changing Macs.
    public func stop() {
        stopped = true
        pending?.cancel()
        stuck?.cancel()
        dropSocket()
        peer.hangUp()
    }

    public func handle(_ event: ReceiverEvent) {
        let before = machine.screen
        let actions = machine.handle(event)
        if machine.screen != before { onScreen?(machine.screen) }
        for action in actions { perform(action) }
    }

    private func perform(_ action: ReceiverAction) {
        switch action {
        case .send(let message):
            guard let text = String(data: message.encode(), encoding: .utf8) else { return }
            socket?.send(.string(text)) { _ in /* a failed send is followed by the close */ }
        case .answer(let id, let sdp):
            peer.answer(peer: id, offerSDP: sdp)
        case .addIce(let id, let candidate):
            peer.addIce(peer: id, candidate)
        case .hangUp:
            peer.hangUp()
        case .armStuck(let token, let after):
            stuck?.cancel()
            stuck = Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(after * 1_000_000_000))
                guard !Task.isCancelled else { return }
                self?.handle(.stuckFired(token: token))
            }
        case .clearStuck:
            stuck?.cancel()
            stuck = nil
        case .reconnect(let after), .restart(let after):
            dropSocket()
            pending?.cancel()
            pending = Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(after * 1_000_000_000))
                guard !Task.isCancelled, let self, !self.stopped else { return }
                self.open()
            }
        }
    }

    private func open() {
        dropSocket()
        generation += 1
        let gen = generation
        let task = session.webSocketTask(with: address.socketURL)
        socket = task
        task.resume()
        receive(task, gen)
    }

    private func dropSocket() {
        generation += 1
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
    }

    private func receive(_ task: URLSessionWebSocketTask, _ gen: Int) {
        task.receive { [weak self] result in
            Task { @MainActor in
                guard let self, gen == self.generation else { return }
                switch result {
                case .success(let message):
                    let data: Data
                    switch message {
                    case .string(let s): data = Data(s.utf8)
                    case .data(let d): data = d
                    @unknown default: data = Data()
                    }
                    // A malformed frame is not worth tearing the link down for (useRemoteLink).
                    if let inbound = RelayInbound.decode(data) { self.handle(.relay(inbound)) }
                    self.receive(task, gen)
                case .failure:
                    // A failed handshake and a dropped socket both end here.
                    self.socket = nil
                    self.generation += 1
                    self.handle(.socketClosed)
                }
            }
        }
    }
}

/// URLSession reports a WebSocket's open only to its delegate. A send queued before the
/// handshake would also go out once it completes, but the hello must follow the open, as
/// it does on the page, so the machine sees the open as an event of its own.
private final class SocketDelegate: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {
    var opened: ((URLSessionWebSocketTask) -> Void)?
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        opened?(webSocketTask)
    }
}
