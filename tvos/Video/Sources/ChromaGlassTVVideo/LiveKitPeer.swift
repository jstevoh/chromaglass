import ChromaGlassTVCore
import Foundation
import LiveKitWebRTC

/// The receiver's peer connection over LiveKit's WebRTC (PLAN.md 12-tv-apple). It does what
/// the ReceiverMachine asks and reports back, and nothing else: the rules (when to give
/// up, when to start over) are the machine's, checked by `npm run tvswift`.
///
/// What it does that the /tv page does too:
/// - no ICE servers: the Mac and the TV are on one network, and a TV that reaches out to a
///   STUN server learns nothing a house's own addresses do not already say;
/// - receive only: the TV sends nothing, so the answer offers no tracks of its own;
/// - "connected" is the ICE link up, reported apart from the first frame, because a plate
///   drawing slowly sends its first frame late and must not be taken for a stuck one.
///
/// Each connection carries the number the machine gave it, and every callback checks it
/// against the current one before reporting, so a report from a connection already hung
/// up (WebRTC calls back on its own threads, after `close()` too) is dropped here as well
/// as in the machine.
@MainActor
public final class LiveKitPeer: NSObject, PeerLink {
    public var report: ((ReceiverEvent) -> Void)?
    /// The remote video track, for the view to draw: set when the Mac's track arrives,
    /// cleared on hang-up. The app's view attaches its renderer here.
    public var onTrack: ((LKRTCVideoTrack?) -> Void)?

    private let factory: LKRTCPeerConnectionFactory
    private var pc: LKRTCPeerConnection?
    private var peerId = 0
    private var delegateBox: Delegate?
    private var frameWatch: FirstFrame?
    private var track: LKRTCVideoTrack?

    public override init() {
        LKRTCInitializeSSL()
        factory = LKRTCPeerConnectionFactory(
            encoderFactory: LKRTCDefaultVideoEncoderFactory(),
            decoderFactory: LKRTCDefaultVideoDecoderFactory())
        super.init()
    }

    public func answer(peer: Int, offerSDP: String) {
        hangUp()
        peerId = peer
        let config = LKRTCConfiguration()
        config.iceServers = []
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherOnce
        let box = Delegate(owner: self, peer: peer)
        guard let pc = factory.peerConnection(
            with: config,
            constraints: LKRTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil),
            delegate: box)
        else { report?(.answerFailed(peer: peer)); return }
        self.pc = pc
        delegateBox = box

        let offer = LKRTCSessionDescription(type: .offer, sdp: offerSDP)
        let receiveOnly = LKRTCMediaConstraints(
            mandatoryConstraints: ["OfferToReceiveVideo": "true", "OfferToReceiveAudio": "false"],
            optionalConstraints: nil)
        Task { @MainActor [weak self] in
            do {
                try await pc.setRemoteDescription(offer)
                guard let self, self.peerId == peer else { return }
                let sdp = try await pc.answer(for: receiveOnly)
                guard self.peerId == peer else { return }
                try await pc.setLocalDescription(sdp)
                guard self.peerId == peer else { return }
                self.report?(.localAnswer(peer: peer, sdp: sdp.sdp))
            } catch {
                // An offer this build cannot take (a codec it lacks): the machine shows
                // "lost" and its stuck timer starts the TV over, as the page does.
                guard let self, self.peerId == peer else { return }
                self.report?(.answerFailed(peer: peer))
            }
        }
    }

    public func addIce(peer: Int, _ candidate: IceCandidate?) {
        // The end of the Mac's candidates needs nothing from this side: WebRTC finishes
        // with what it has (the page's addIceCandidate(null) is the same no-op in effect).
        guard peer == peerId, let pc, let candidate else { return }
        let c = LKRTCIceCandidate(sdp: candidate.candidate,
                                  sdpMLineIndex: candidate.sdpMLineIndex ?? 0,
                                  sdpMid: candidate.sdpMid)
        pc.add(c) { _ in /* a candidate the link cannot use is not a failure of the link */ }
    }

    public func hangUp() {
        peerId = 0
        if let track, let frameWatch { track.remove(frameWatch) }
        frameWatch = nil
        track = nil
        onTrack?(nil)
        delegateBox = nil
        pc?.close()
        pc = nil
    }

    // MARK: what the connection reports, already back on the main actor

    fileprivate func gotCandidate(_ peer: Int, _ c: LKRTCIceCandidate?) {
        guard peer == peerId else { return }
        report?(.localIce(peer: peer, c.map {
            IceCandidate(candidate: $0.sdp, sdpMid: $0.sdpMid, sdpMLineIndex: $0.sdpMLineIndex)
        }))
    }

    fileprivate func stateChanged(_ peer: Int, _ state: LKRTCPeerConnectionState) {
        guard peer == peerId else { return }
        switch state {
        case .connected: report?(.peerConnected(peer: peer))
        // "disconnected" is not failed: on a house's Wi-Fi it often comes back by itself,
        // and the page waits it out the same way (only "failed" starts it over).
        case .failed: report?(.peerFailed(peer: peer))
        default: break
        }
    }

    fileprivate func gotTrack(_ peer: Int, _ t: LKRTCVideoTrack) {
        guard peer == peerId else { return }
        if let track, let frameWatch { track.remove(frameWatch) }
        track = t
        let watch = FirstFrame { [weak self] in
            Task { @MainActor in
                guard let self, self.peerId == peer else { return }
                self.report?(.firstFrame(peer: peer))
            }
        }
        frameWatch = watch
        t.add(watch)
        onTrack?(t)
    }
}

/// WebRTC holds its delegate weakly and calls it on its signalling thread; this hops each
/// call to the main actor with the connection's number.
private final class Delegate: NSObject, LKRTCPeerConnectionDelegate, @unchecked Sendable {
    weak var owner: LiveKitPeer?
    let peer: Int
    init(owner: LiveKitPeer, peer: Int) { self.owner = owner; self.peer = peer }

    private func hop(_ f: @escaping @MainActor (LiveKitPeer) -> Void) {
        Task { @MainActor [weak owner] in if let owner { f(owner) } }
    }

    func peerConnection(_ peerConnection: LKRTCPeerConnection, didGenerate candidate: LKRTCIceCandidate) {
        let peer = peer
        hop { $0.gotCandidate(peer, candidate) }
    }

    func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange newState: LKRTCIceGatheringState) {
        // Gathering complete is the page's `candidate: null`: the Mac stops waiting for more.
        guard newState == .complete else { return }
        let peer = peer
        hop { $0.gotCandidate(peer, nil) }
    }

    func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange newState: LKRTCPeerConnectionState) {
        let peer = peer
        hop { $0.stateChanged(peer, newState) }
    }

    func peerConnection(_ peerConnection: LKRTCPeerConnection, didAdd rtpReceiver: LKRTCRtpReceiver, streams mediaStreams: [LKRTCMediaStream]) {
        guard let video = rtpReceiver.track as? LKRTCVideoTrack else { return }
        let peer = peer
        hop { $0.gotTrack(peer, video) }
    }

    // The rest of the delegate: nothing the receiver acts on.
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange stateChanged: LKRTCSignalingState) {}
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didAdd stream: LKRTCMediaStream) {}
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didRemove stream: LKRTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: LKRTCPeerConnection) {}
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange newState: LKRTCIceConnectionState) {}
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didRemove candidates: [LKRTCIceCandidate]) {}
    func peerConnection(_ peerConnection: LKRTCPeerConnection, didOpen dataChannel: LKRTCDataChannel) {}
}

/// Tells the receiver once that a frame has been decoded: what the page reads as the
/// video's `loadeddata`. A renderer attached beside the view's, so it sees the same frames.
private final class FirstFrame: NSObject, LKRTCVideoRenderer, @unchecked Sendable {
    private var fired = false
    private let lock = NSLock()
    private let onFirst: @Sendable () -> Void
    init(_ onFirst: @escaping @Sendable () -> Void) { self.onFirst = onFirst }

    func setSize(_ size: CGSize) {}
    func renderFrame(_ frame: LKRTCVideoFrame?) {
        guard frame != nil else { return }
        lock.lock()
        let first = !fired
        fired = true
        lock.unlock()
        if first { onFirst() }
    }
}
