// The Swift side of `npm run tvswift` (scripts/tvswift.mjs, PLAN.md 12-tv-apple).
//
// The harness runs the real licence Worker handler on a local port, with generated keys,
// and starts this probe pointed at it: CGTV_BASE is the Worker's address, CGTV_KEY_X the
// licence public key's `x`. The harness plays the phone: it claims the second code the
// TV draws and lets the first run out, so the probe sees a code expire and a new one
// drawn, as a TV left on the sign-in screen would.
//
// The probe drives the app's own sign-in code (ChromaGlassTVCore) end to end and prints
// one ` ok ` or `FAIL` line per promise. What a line asserts is read from what the
// Worker answered, verified by the app's own check, never from the probe's own state.

import ChromaGlassTVCore
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

var failures = 0
var passes = 0
func check(_ name: String, _ ok: Bool, _ detail: String = "") {
    if ok { passes += 1 } else { failures += 1 }
    print("\(ok ? " ok " : "FAIL")  \(name)\(detail.isEmpty ? "" : " — \(detail)")")
}

let env = ProcessInfo.processInfo.environment
guard let baseText = env["CGTV_BASE"], let base = URL(string: baseText),
      let keyX = env["CGTV_KEY_X"], let key = LicenceKey.publicKey(x: keyX)
else {
    print("FAIL  CGTV_BASE and CGTV_KEY_X are needed (run it through npm run tvswift)")
    exit(1)
}
let client = TvSignInClient(base: base)

actor Codes {
    var shown: [TvCode] = []
    func add(_ c: TvCode) { shown.append(c) }
}
let codes = Codes()

// 1. Linking: a code, a second code after the first runs out, then a pass.
let linked: TvPass
do {
    linked = try await linkTv(client: client, publicKey: key, pollEvery: 0.2) { code in
        await codes.add(code)
    }
} catch {
    check("the TV links by a code", false, "\(error)")
    exit(1)
}
let shown = await codes.shown
check("the TV shows codes as XXXX-XXXX and links its QR to the phone page",
      shown.allSatisfy { $0.userCode.range(of: "^[A-Z]{4}-[A-Z]{4}$", options: .regularExpression) != nil }
        && shown.first.map { $0.linkURL().absoluteString == "https://chromaglass.art/?tvlink=" + $0.userCode.replacingOccurrences(of: "-", with: "") } == true,
      shown.map(\.userCode).joined(separator: ", "))
check("a code that runs out is replaced by a fresh one, and the fresh one links",
      shown.count == 2 && shown[0].userCode != shown[1].userCode, "\(shown.count) codes")
check("the pass verifies under the licence key with the account's tier and a 30-day life",
      linked.tier == .pro && linked.gen == 1 && abs(linked.expires.timeIntervalSince(linked.issuedAt) - 30 * 86_400) < 5,
      "tier \(linked.tier.rawValue), gen \(linked.gen)")
check("a fresh pass does not ask to renew; one with six days left does",
      !linked.needsRenewal() && linked.needsRenewal(now: linked.expires.addingTimeInterval(-6 * 86_400)))
check("a pass past its end no longer verifies",
      TvPass.verify(linked.token, publicKey: key, now: linked.expires.addingTimeInterval(1)) == nil)

// 2. What does not verify.
let parts = linked.token.split(separator: ".").map(String.init)
var body = Data(Base64URL.decode(parts[1])!)
let json = try! JSONSerialization.jsonObject(with: body) as! [String: Any]
var raised = json
raised["tier"] = "pro"
raised["exp"] = (json["exp"] as! NSNumber).doubleValue + 365 * 86_400_000
body = try! JSONSerialization.data(withJSONObject: raised)
let tampered = "cgtv1.\(Base64URL.encode(body)).\(parts[2])"
check("a pass with its body changed (a year added) is refused",
      TvPass.verify(tampered, publicKey: key) == nil)
let stranger = Curve25519.Signing.PrivateKey()
let forgedBody = "cgtv1.\(parts[1])"
let forged = "\(forgedBody).\(Base64URL.encode(try! stranger.signature(for: Data(forgedBody.utf8))))"
check("a pass signed by another key is refused", TvPass.verify(forged, publicKey: key) == nil)
check("a licence key (cg1) is not a pass", TvPass.verify("cg1.\(parts[1]).\(parts[2])", publicKey: key) == nil)

// 3. Renewing: the link's generation moves on, and the old pass is spent.
do {
    let renewed = try await client.renew(pass: linked.token)
    guard case .renewed(let token) = renewed, let next = TvPass.verify(token, publicKey: key) else {
        check("a pass renews to the next generation of the same link", false, "\(renewed)")
        exit(1)
    }
    check("a pass renews to the next generation of the same link",
          next.id == linked.id && next.gen == 2 && next.tier == linked.tier, "gen \(next.gen)")
    let again = try await client.renew(pass: linked.token)
    if case .unlinked(let why) = again {
        check("the pass it replaced, renewed after it, unlinks the TV (a copied pass dies)", true, why)
    } else {
        check("the pass it replaced, renewed after it, unlinks the TV (a copied pass dies)", false, "\(again)")
    }
    let after = try await client.renew(pass: token)
    if case .unlinked = after {
        check("and the link is gone for the newer pass too: one link, one TV", true)
    } else {
        check("and the link is gone for the newer pass too: one link, one TV", false, "\(after)")
    }
    let junk = try await client.renew(pass: tampered)
    if case .unlinked = junk {
        check("the Worker refuses the tampered pass as well", true)
    } else {
        check("the Worker refuses the tampered pass as well", false, "\(junk)")
    }
} catch {
    check("renewing reaches the Worker", false, "\(error)")
}

// 4. The relay's messages, as the /tv page and the Mac write them.
let hello = String(data: RelayOutbound.hello(key: "K3Y").encode(), encoding: .utf8)!
check("the TV says hello to the relay as the /tv page does",
      hello == #"{"key":"K3Y","role":"tv","type":"hello"}"#, hello)
let offer = RelayInbound.decode(Data(#"{"type":"tv-signal","signal":{"kind":"offer","sdp":"v=0"}}"#.utf8))
let ice = RelayInbound.decode(Data(#"{"type":"tv-signal","signal":{"kind":"ice","candidate":{"candidate":"candidate:1 1 udp 1 10.0.0.2 5000 typ host","sdpMid":"0","sdpMLineIndex":0}}}"#.utf8))
let end = RelayInbound.decode(Data(#"{"type":"tv-signal","signal":{"kind":"ice","candidate":null}}"#.utf8))
let locked = RelayInbound.decode(Data(#"{"type":"denied","reason":"locked","retryMs":60000}"#.utf8))
check("the Mac's offer, candidates, end of candidates and a lockout read as the TV needs them",
      offer == .offer(sdp: "v=0")
        && ice == .ice(IceCandidate(candidate: "candidate:1 1 udp 1 10.0.0.2 5000 typ host", sdpMid: "0", sdpMLineIndex: 0))
        && end == .ice(nil) && locked == .denied(reason: "locked", retry: 60))
let answer = String(data: RelayOutbound.ice(nil).encode(), encoding: .utf8)!
check("the TV's end of candidates is a null candidate, as the Mac reads it",
      answer == #"{"signal":{"candidate":null,"kind":"ice"},"type":"tv-signal"}"#, answer)
let address = RelayAddress(tvAddress: "192.168.1.20:8787/tv?key=AB12")
check("the Mac's TV address, typed with or without http://, gives the relay and key",
      address == RelayAddress(host: "192.168.1.20", port: 8787, key: "AB12")
        && address?.socketURL.absoluteString == "ws://192.168.1.20:8787/remote-ws"
        && RelayAddress(tvAddress: "http://192.168.1.20:8787/tv") == nil)

print("\n\(passes)/\(passes + failures) probe checks passed")
exit(failures == 0 ? 0 : 1)
