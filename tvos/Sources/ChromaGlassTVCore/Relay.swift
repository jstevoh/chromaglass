import Foundation

/// What the TV and the show's relay say to each other over the WebSocket at
/// `/remote-ws` (server/remote-server.js's `tv` role, PLAN.md 12-tv and 12-tv-apple).
/// The same messages the `/tv` page sends and reads (src/components/TvDisplay.tsx), so
/// an Apple TV is, to the relay and the Mac, just another TV.
///
/// The TV says hello with the show key; the relay answers `denied` (a wrong key, or
/// an address locked out after wrong keys) or pairs the TV with the display and says
/// `tv-show` with whether a show is on. The display then offers WebRTC through the
/// relay as `tv-signal`: an offer (H.264 video), ICE candidates, or `refused` (the
/// show's licence is below Home, or three TVs already watch). The TV answers with its
/// own `tv-signal`: an answer and its candidates, `null` for the end of them.
public enum RelayInbound: Equatable, Sendable {
    case denied(reason: String, retry: TimeInterval?)
    case show(here: Bool)
    case offer(sdp: String)
    case ice(IceCandidate?)
    case refused(reason: String)
    /// Anything else the relay sends (the remote's messages share the socket's types);
    /// a TV ignores it.
    case other(type: String)

    public static func decode(_ data: Data) -> RelayInbound? {
        guard let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let type = obj["type"] as? String
        else { return nil }
        switch type {
        case "denied":
            let retry = (obj["retryMs"] as? NSNumber).map { $0.doubleValue / 1000 }
            return .denied(reason: obj["reason"] as? String ?? "key", retry: retry)
        case "tv-show":
            return .show(here: obj["here"] as? Bool ?? false)
        case "tv-signal":
            guard let s = obj["signal"] as? [String: Any], let kind = s["kind"] as? String else { return nil }
            switch kind {
            case "offer":
                guard let sdp = s["sdp"] as? String else { return nil }
                return .offer(sdp: sdp)
            case "ice":
                if s["candidate"] == nil || s["candidate"] is NSNull { return .ice(nil) }
                guard let c = s["candidate"] as? [String: Any], let line = c["candidate"] as? String else { return nil }
                return .ice(IceCandidate(candidate: line, sdpMid: c["sdpMid"] as? String,
                                         sdpMLineIndex: (c["sdpMLineIndex"] as? NSNumber)?.int32Value,
                                         usernameFragment: c["usernameFragment"] as? String))
            case "refused":
                return .refused(reason: s["reason"] as? String ?? "tier")
            default:
                return .other(type: "tv-signal:\(kind)")
            }
        default:
            return .other(type: type)
        }
    }
}

/// An ICE candidate as the browser's `RTCIceCandidate.toJSON()` writes it, which is what
/// the Mac sends and expects back.
public struct IceCandidate: Equatable, Sendable {
    public let candidate: String
    public let sdpMid: String?
    public let sdpMLineIndex: Int32?
    public let usernameFragment: String?

    public init(candidate: String, sdpMid: String?, sdpMLineIndex: Int32?, usernameFragment: String? = nil) {
        self.candidate = candidate
        self.sdpMid = sdpMid
        self.sdpMLineIndex = sdpMLineIndex
        self.usernameFragment = usernameFragment
    }

    var json: [String: Any] {
        var o: [String: Any] = ["candidate": candidate]
        if let sdpMid { o["sdpMid"] = sdpMid }
        if let sdpMLineIndex { o["sdpMLineIndex"] = Int(sdpMLineIndex) }
        if let usernameFragment { o["usernameFragment"] = usernameFragment }
        return o
    }
}

public enum RelayOutbound: Equatable, Sendable {
    case hello(key: String)
    case answer(sdp: String)
    case ice(IceCandidate?)

    public func encode() -> Data {
        let obj: [String: Any]
        switch self {
        case .hello(let key):
            obj = ["type": "hello", "role": "tv", "key": key]
        case .answer(let sdp):
            obj = ["type": "tv-signal", "signal": ["kind": "answer", "sdp": sdp]]
        case .ice(let c):
            obj = ["type": "tv-signal", "signal": ["kind": "ice", "candidate": c.map { $0.json as Any } ?? NSNull()]]
        }
        return try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
    }
}

/// Where the show's relay is: the Mac's LAN address and port, and the show key, as the
/// Mac's "TV at home" address carries them (`http://<lan>:<port>/tv?key=<KEY>`, Show
/// Server Details). The TV keeps it so the next launch goes straight to the picture.
public struct RelayAddress: Equatable, Sendable, Codable {
    public let host: String
    public let port: Int
    public let key: String

    public init(host: String, port: Int, key: String) {
        self.host = host
        self.port = port
        self.key = key
    }

    /// Reads the address the Mac shows for TVs. Accepts the full link or just
    /// `host:port/tv?key=…`, since it may be typed with a remote.
    public init?(tvAddress: String) {
        var s = tvAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        if !s.contains("://") { s = "http://" + s }
        guard let c = URLComponents(string: s), let host = c.host, !host.isEmpty,
              let key = c.queryItems?.first(where: { $0.name == "key" })?.value, !key.isEmpty
        else { return nil }
        self.init(host: host, port: c.port ?? 80, key: key)
    }

    public var socketURL: URL {
        var c = URLComponents()
        c.scheme = "ws"
        c.host = host
        c.port = port
        c.path = "/remote-ws"
        return c.url!
    }
}
