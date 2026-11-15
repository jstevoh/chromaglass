import Foundation

/// What the TV's screen says, the same states the /tv page has (TvDisplay.tsx's TvState),
/// so a Google TV and an Apple TV in one house tell the player the same thing.
public enum TvScreen: Equatable, Sendable {
    /// No relay is answering: the Mac is off, asleep, or on another network.
    case connecting
    /// The relay answers but the Mac's show is not on.
    case waiting
    /// The show is on and the picture is being set up.
    case looking
    /// Frames are arriving.
    case live
    /// The picture was set up and then lost, or never came: starting over.
    case lost
    /// The show key is wrong. Retrying with the same key cannot help, so the TV asks for
    /// the address again.
    case denied
    /// This address gave three wrong keys and the relay refuses it for a while.
    case locked
    /// The Mac said no: "tier" (the Mac's licence has no TV out) or "full" (three TVs are
    /// already watching).
    case refused(reason: String)
}

/// Everything that can happen to a receiver: what the relay said, what the socket did,
/// what the peer connection reported, and the timers firing. `peer` numbers each peer
/// connection the machine asked for, so a late report from one already hung up is
/// dropped, as the /tv page drops it (`pcRef.current !== pc`).
public enum ReceiverEvent: Equatable, Sendable {
    case socketOpened
    case socketClosed
    case relay(RelayInbound)
    case localAnswer(peer: Int, sdp: String)
    case localIce(peer: Int, IceCandidate?)
    case answerFailed(peer: Int)
    case peerConnected(peer: Int)
    case peerFailed(peer: Int)
    case firstFrame(peer: Int)
    case stuckFired(token: Int)
}

/// What the machine asks of the platform: the socket, the peer connection and the timers.
public enum ReceiverAction: Equatable, Sendable {
    case send(RelayOutbound)
    /// Build a fresh peer connection numbered `peer`, take the offer and make an answer.
    case answer(peer: Int, offerSDP: String)
    case addIce(peer: Int, IceCandidate?)
    case hangUp
    /// Fire `.stuckFired(token)` after `after` seconds unless a newer arm or a clear comes.
    case armStuck(token: Int, after: TimeInterval)
    case clearStuck
    /// The socket closed by itself: open a new one after a while.
    case reconnect(after: TimeInterval)
    /// Close the socket on purpose and start again with a fresh hello: what a reload is
    /// on the /tv page, and what makes the relay hand the Mac a new join for this TV.
    case restart(after: TimeInterval)
}

/// The waits, in seconds. The defaults are the /tv page's (TV_CONNECT_MS, the 2 s before
/// its reload, useRemoteLink's RETRY_MIN and RETRY_MAX and its lockout floor), so the two
/// TVs behave alike; the probe shortens them to run in a few seconds.
public struct ReceiverTiming: Equatable, Sendable {
    public var connect: TimeInterval = 10
    public var restart: TimeInterval = 2
    public var retryMin: TimeInterval = 0.5
    public var retryMax: TimeInterval = 8
    public var lockout: TimeInterval = 300
    public init() {}
    public init(connect: TimeInterval, restart: TimeInterval, retryMin: TimeInterval, retryMax: TimeInterval, lockout: TimeInterval) {
        self.connect = connect; self.restart = restart
        self.retryMin = retryMin; self.retryMax = retryMax; self.lockout = lockout
    }
}

/// The receiver's logic with nothing platform in it: events in, actions out. It is the
/// /tv page's connection code (TvDisplay.tsx and useRemoteLink.ts) written as one value,
/// so the Apple TV app's behaviour is checked by `npm run tvswift` on any machine with
/// Swift, and the LiveKit WebRTC wrapper in the app does only what an action says.
///
/// The page's rules it keeps:
/// - hello on every open, with the show key;
/// - a show that comes on arms the stuck timer; a picture that has not come in
///   `connect` seconds is lost, and the TV starts over (a black screen forever is the
///   worst thing a TV can do);
/// - a peer that connects is not stuck, even before its first frame: a plate drawing
///   slowly sends its first frame late (measured on the page, a restart every ten
///   seconds while it timed only the frame);
/// - a peer that fails is lost, and the TV starts over;
/// - a wrong key stops retrying; a lockout waits it out, at least `retryMax`;
/// - a socket that drops reconnects with doubling waits, from `retryMin` to `retryMax`.
public struct ReceiverMachine: Sendable {
    public let key: String
    public let timing: ReceiverTiming
    public private(set) var screen: TvScreen = .connecting
    /// The peer connection the machine last asked for, while it is up.
    public private(set) var activePeer: Int?
    private var nextPeer = 1
    private var stuckToken: Int?
    private var nextToken = 1
    private var retry: TimeInterval
    /// Refused or locked out: the socket's close that follows must not retry early.
    private var holding = false

    public init(key: String, timing: ReceiverTiming = ReceiverTiming()) {
        self.key = key
        self.timing = timing
        self.retry = timing.retryMin
    }

    public mutating func handle(_ event: ReceiverEvent) -> [ReceiverAction] {
        switch event {
        case .socketOpened:
            retry = timing.retryMin
            holding = false
            if screen == .connecting || screen == .lost { screen = .waiting }
            return [.send(.hello(key: key))]

        case .socketClosed:
            if holding { return [] }
            var out = hangUp()
            out += clearStuck()
            if screen != .denied && !isRefused { screen = .connecting }
            let wait = retry
            retry = min(timing.retryMax, retry * 2)
            return out + [.reconnect(after: wait)]

        case .relay(let message):
            return onRelay(message)

        case .localAnswer(let peer, let sdp):
            guard peer == activePeer else { return [] }
            return [.send(.answer(sdp: sdp))]

        case .localIce(let peer, let candidate):
            guard peer == activePeer else { return [] }
            return [.send(.ice(candidate))]

        case .answerFailed(let peer):
            // The page hangs up and shows "lost"; its stuck timer, still armed, starts it over.
            guard peer == activePeer else { return [] }
            screen = .lost
            return hangUp()

        case .peerConnected(let peer):
            guard peer == activePeer else { return [] }
            return clearStuck()

        case .peerFailed(let peer):
            guard peer == activePeer else { return [] }
            screen = .lost
            return hangUp() + clearStuck() + [.restart(after: timing.restart)]

        case .firstFrame(let peer):
            guard peer == activePeer else { return [] }
            screen = .live
            return clearStuck()

        case .stuckFired(let token):
            guard token == stuckToken else { return [] }
            stuckToken = nil
            screen = .lost
            return hangUp() + [.restart(after: timing.restart)]
        }
    }

    private mutating func onRelay(_ message: RelayInbound) -> [ReceiverAction] {
        switch message {
        case .denied(let reason, let wait):
            holding = true
            let out = hangUp() + clearStuck()
            if reason == "locked" {
                screen = .locked
                return out + [.reconnect(after: max(timing.retryMax, wait ?? timing.lockout))]
            }
            screen = .denied
            return out

        case .show(let here):
            if here {
                if screen != .live { screen = .looking }
                return armStuck()
            }
            screen = .waiting
            return hangUp() + clearStuck()

        case .offer(let sdp):
            var out = hangUp()
            let peer = nextPeer
            nextPeer += 1
            activePeer = peer
            if screen != .live { screen = .looking }
            out += armStuck()
            out.append(.answer(peer: peer, offerSDP: sdp))
            return out

        case .ice(let candidate):
            guard let peer = activePeer else { return [] }
            return [.addIce(peer: peer, candidate)]

        case .refused(let reason):
            screen = .refused(reason: reason)
            return hangUp() + clearStuck()

        case .other:
            return []
        }
    }

    private var isRefused: Bool { if case .refused = screen { return true } else { return false } }

    private mutating func hangUp() -> [ReceiverAction] {
        guard activePeer != nil else { return [] }
        activePeer = nil
        return [.hangUp]
    }

    private mutating func armStuck() -> [ReceiverAction] {
        let token = nextToken
        nextToken += 1
        stuckToken = token
        return [.armStuck(token: token, after: timing.connect)]
    }

    private mutating func clearStuck() -> [ReceiverAction] {
        guard stuckToken != nil else { return [] }
        stuckToken = nil
        return [.clearStuck]
    }
}
