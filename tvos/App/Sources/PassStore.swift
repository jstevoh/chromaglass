import ChromaGlassTVCore
import Foundation
import Security

/// Where the TV keeps what it must remember across launches: the pass the licence Worker
/// signed (PLAN.md 12-tv-signin) and the Mac's address with its show key. Both live in the
/// keychain, not in UserDefaults: the pass is what unlocks the picture and the key is what
/// lets a TV into the show, and tvOS can purge an app's defaults when space runs short.
///
/// Items are this-device-only, so a pass is never carried to another TV by a backup: a
/// copied pass is the one thing the Worker unlinks on sight (`tv/renew`'s generation check).
enum PassStore {
    private static let service = "app.chromaglass.tv"

    static var pass: String? {
        get { read("pass") }
        set { write("pass", newValue) }
    }

    static var address: RelayAddress? {
        get { read("address").flatMap { try? JSONDecoder().decode(RelayAddress.self, from: Data($0.utf8)) } }
        set { write("address", newValue.flatMap { try? JSONEncoder().encode($0) }.flatMap { String(data: $0, encoding: .utf8) }) }
    }

    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    private static func read(_ account: String) -> String? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func write(_ account: String, _ value: String?) {
        SecItemDelete(query(account) as CFDictionary)
        guard let value else { return }
        var q = query(account)
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }
}
