#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The TV's half of the sign-in by a short code (PLAN.md 12-tv-signin): it asks the
/// licence Worker for a code, shows it, and polls until a phone has claimed it.
///
/// The routes are server/tv-code.js's, and their answers are read here exactly as it
/// writes them:
///
/// - `POST /tv/code` → `{ok, userCode: "BDKM-QXTZ", deviceCode, expiresIn, interval}`;
/// - `POST /tv/poll {userCode, deviceCode}` → `{status: "pending"}`, `{status: "ok",
///   tier, pass}` once, or `{status: "expired"}` (also what a wrong device code reads
///   as, so a guesser learns nothing);
/// - `POST /tv/renew {pass}` → `{tier, pass}`, or 401 with `error` "unlinked", "key
///   revoked" or "bad pass";
/// - any route over its hourly allowance → 429 with `retryAfter` in seconds.
///
/// The device code is the TV's secret: it never leaves the TV but to the Worker, and
/// the phone never sees it. The user code is what the screen shows and the QR carries.
public struct TvCode: Equatable, Sendable {
    public let userCode: String
    public let deviceCode: String
    public let expires: Date
    public let interval: TimeInterval

    /// What the QR on the TV opens: the phone's page with the code filled in. The phone
    /// still asks the player to confirm a code that came in a link (TvLink.tsx), so a
    /// photo of someone else's QR cannot claim on one tap.
    public func linkURL(site: URL = URL(string: "https://chromaglass.art/")!) -> URL {
        var c = URLComponents(url: site, resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "tvlink", value: userCode.replacingOccurrences(of: "-", with: ""))]
        return c.url!
    }
}

public enum TvPollResult: Equatable, Sendable {
    case pending
    case linked(pass: String)
    case expired
}

public enum TvRenewResult: Equatable, Sendable {
    case renewed(pass: String)
    /// The link is gone (unlinked, a copy was seen, every key refunded, or the pass is
    /// not one the Worker made): the TV forgets its pass and shows a new code.
    case unlinked(reason: String)
}

public enum TvSignInError: Error, Equatable {
    case tooMany(retryAfter: TimeInterval)
    case unreachable
    case badAnswer(status: Int)
}

/// Sends the routes. One request at a time is all a TV needs, so this is a plain struct
/// over a URLSession, not an actor; the flow that drives it owns the ordering.
public struct TvSignInClient: Sendable {
    public let base: URL
    public let session: URLSession

    /// `base` is the licence Worker's address with no path (the same value the site
    /// builds with as VITE_FIREBASE_LICENSES_URL, less any `/keys`).
    public init(base: URL, session: URLSession = .shared) {
        self.base = base
        self.session = session
    }

    public func requestCode(now: Date = Date()) async throws -> TvCode {
        let (status, obj) = try await post("tv/code", [:])
        guard status == 200,
              let user = obj["userCode"] as? String,
              let device = obj["deviceCode"] as? String,
              let expiresIn = (obj["expiresIn"] as? NSNumber)?.doubleValue
        else { throw TvSignInError.badAnswer(status: status) }
        let interval = (obj["interval"] as? NSNumber)?.doubleValue ?? 5
        return TvCode(userCode: user, deviceCode: device,
                      expires: now.addingTimeInterval(expiresIn), interval: max(1, interval))
    }

    public func poll(_ code: TvCode) async throws -> TvPollResult {
        let (status, obj) = try await post("tv/poll", ["userCode": code.userCode, "deviceCode": code.deviceCode])
        guard status == 200 else { throw TvSignInError.badAnswer(status: status) }
        switch obj["status"] as? String {
        case "pending": return .pending
        case "expired": return .expired
        case "ok":
            guard let pass = obj["pass"] as? String else { throw TvSignInError.badAnswer(status: status) }
            return .linked(pass: pass)
        default: throw TvSignInError.badAnswer(status: status)
        }
    }

    public func renew(pass: String) async throws -> TvRenewResult {
        let (status, obj) = try await post("tv/renew", ["pass": pass])
        if status == 200, let next = obj["pass"] as? String { return .renewed(pass: next) }
        if status == 401 { return .unlinked(reason: obj["error"] as? String ?? "unlinked") }
        throw TvSignInError.badAnswer(status: status)
    }

    private func post(_ path: String, _ body: [String: String]) async throws -> (Int, [String: Any]) {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 15
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let data: Data
        let response: URLResponse
        do { (data, response) = try await session.data(for: req) } catch { throw TvSignInError.unreachable }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if status == 429 {
            let wait = (obj["retryAfter"] as? NSNumber)?.doubleValue
                ?? Double((response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Retry-After") ?? "") ?? 60
            throw TvSignInError.tooMany(retryAfter: wait)
        }
        return (status, obj)
    }
}

/// Drives a code to a pass: request, then poll at the Worker's interval until the phone
/// links it or the code runs out, when a fresh code is drawn (a TV left on the sign-in
/// screen keeps showing a live code, not a dead one). `onCode` is called with every code
/// shown, so the screen can redraw it. Cancelling the task stops it.
public func linkTv(client: TvSignInClient,
                   publicKey: Curve25519.Signing.PublicKey,
                   minimumInterval: TimeInterval = 1,
                   pollEvery: TimeInterval? = nil,
                   onCode: @Sendable (TvCode) async -> Void) async throws -> TvPass {
    while true {
        try Task.checkCancellation()
        let code = try await client.requestCode()
        await onCode(code)
        // The Worker's interval, never faster: polling is metered per address (1440 an
        // hour, PLAN 12-tv-signin), and a household's TVs share one address. `pollEvery`
        // is for the probe, which runs against a local Worker with no allowance to keep.
        let step = pollEvery ?? max(minimumInterval, code.interval)
        while Date() < code.expires {
            try await Task.sleep(nanoseconds: UInt64(step * 1_000_000_000))
            let result: TvPollResult
            do {
                result = try await client.poll(code)
            } catch TvSignInError.unreachable {
                continue
            } catch TvSignInError.tooMany(let wait) {
                // Over the address's allowance: wait it out rather than fail the screen.
                // The code may run out meanwhile, and the outer loop draws a new one.
                try await Task.sleep(nanoseconds: UInt64(max(wait, step) * 1_000_000_000))
                continue
            }
            switch result {
            case .pending: continue
            case .expired: break
            case .linked(let token):
                // A pass that does not verify is not kept: it would unlock nothing, and a
                // TV that stored it would never ask again. Draw a new code instead.
                if let pass = TvPass.verify(token, publicKey: publicKey) { return pass }
            }
            break
        }
    }
}
