import Foundation

/// Base64url without padding, the encoding the licence Worker writes passes and device
/// codes in (`toBase64Url` in server/tv-code.js). Foundation only reads and writes the
/// standard alphabet with padding, so the two characters and the padding are swapped
/// here, in one place, rather than at every call.
public enum Base64URL {
    public static func decode(_ s: Substring) -> Data? { decode(String(s)) }

    public static func decode(_ s: String) -> Data? {
        // The Worker never writes padding, '+' or '/': a string carrying them is not one
        // of its own, so it is refused rather than read leniently.
        guard !s.contains("="), !s.contains("+"), !s.contains("/") else { return nil }
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let rem = b.count % 4
        if rem == 1 { return nil }
        if rem > 0 { b += String(repeating: "=", count: 4 - rem) }
        return Data(base64Encoded: b)
    }

    public static func encode(_ d: Data) -> String {
        d.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
