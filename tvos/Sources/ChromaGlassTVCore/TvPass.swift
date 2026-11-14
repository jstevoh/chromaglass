#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif
import Foundation

/// The TV's licence: a `cgtv1.` pass from the licence Worker (server/tv-code.js,
/// PLAN.md 12-tv-signin), never the buyer's `cg1.` key.
///
/// The pass is `cgtv1.<body>.<signature>`: the body is base64url JSON
/// `{v, id, gen, keyId, tier, issuedAt, exp}` (times in milliseconds, as JavaScript
/// writes them) and the signature is Ed25519 over the ASCII bytes of `cgtv1.<body>`,
/// made with the same key that signs licence keys. The TV checks it offline against
/// the public key built into the app, so a TV with no internet keeps playing until the
/// pass runs out, and a TV cannot forge or stretch one.
///
/// `id` and `gen` are the link the pass belongs to and its generation. The TV does
/// nothing with them but keep the pass whole: the Worker uses them at renewal to tell
/// the pass it last issued from a copy (the first mismatch unlinks both).
public struct TvPass: Equatable, Sendable {
    public enum Tier: String, Sendable { case home, pro }

    public let token: String
    public let id: String
    public let gen: Int
    public let keyId: String
    public let tier: Tier
    public let issuedAt: Date
    public let expires: Date

    /// Renew once this little is left. The Worker issues thirty days; a week's margin
    /// means a TV that is switched on once a week never lapses.
    public static let renewWithin: TimeInterval = 7 * 86_400

    public func needsRenewal(now: Date = Date()) -> Bool {
        expires.timeIntervalSince(now) <= Self.renewWithin
    }

    /// Reads and checks a pass. Returns nil for anything the Worker's own
    /// `verifyTvPass` would refuse: another prefix, a bad signature, a body without
    /// its fields, or a pass that has run out.
    public static func verify(_ token: String, publicKey: Curve25519.Signing.PublicKey, now: Date = Date()) -> TvPass? {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = trimmed.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0] == "cgtv1",
              let body = Base64URL.decode(parts[1]),
              let sig = Base64URL.decode(parts[2]), sig.count == 64
        else { return nil }
        let signed = Data("cgtv1.\(parts[1])".utf8)
        guard publicKey.isValidSignature(sig, for: signed) else { return nil }
        guard let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let id = obj["id"] as? String,
              let gen = obj["gen"] as? Int, // JSONSerialization gives Int only for whole numbers
              let keyId = obj["keyId"] as? String,
              let tier = (obj["tier"] as? String).flatMap(Tier.init(rawValue:)),
              let exp = (obj["exp"] as? NSNumber)?.doubleValue
        else { return nil }
        let issued = (obj["issuedAt"] as? NSNumber)?.doubleValue ?? 0
        let expires = Date(timeIntervalSince1970: exp / 1000)
        guard expires > now else { return nil }
        return TvPass(token: trimmed, id: id, gen: gen, keyId: keyId, tier: tier,
                      issuedAt: Date(timeIntervalSince1970: issued / 1000), expires: expires)
    }
}

/// The licence public key, in the form the Worker publishes it (a JWK's `x`).
public enum LicenceKey {
    /// The production key: `DEFAULT_PUBLIC_JWK.x` in server/license-key.js. Only the
    /// public half; the private one lives in the Worker's secrets.
    public static let productionX = "E_OrBzBgNWzoKgdlDOVjCjqb6CvkE4L0olobNv2u96A"

    public static func publicKey(x: String) -> Curve25519.Signing.PublicKey? {
        guard let raw = Base64URL.decode(x), raw.count == 32 else { return nil }
        return try? Curve25519.Signing.PublicKey(rawRepresentation: raw)
    }

    public static var production: Curve25519.Signing.PublicKey {
        publicKey(x: productionX)!
    }
}
