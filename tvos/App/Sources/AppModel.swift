import ChromaGlassTVCore
import Foundation
import SwiftUI

/// The app's one piece of state: which screen it is on, and what it needs to get to the
/// picture. The order is the plan's (12-tv-apple): a pass first (no pass, no picture: the
/// TV is a Home or Pro feature and there is no purchase on the TV), then the Mac's address,
/// then the show.
@MainActor
final class AppModel: ObservableObject {
    enum Stage: Equatable {
        case starting
        /// Showing a code for the phone; `code` is nil while the first one is fetched.
        case signIn(code: TvCode?, problem: String?)
        case address(problem: String?)
        case show
    }

    @Published var stage: Stage = .starting
    @Published private(set) var pass: TvPass?
    @Published private(set) var address: RelayAddress?

    let client: TvSignInClient?
    private var linking: Task<Void, Never>?

    init() {
        // The Worker's address comes from the build (Info.plist's CGLicenceURL, filled from
        // the git-ignored Local.xcconfig), never from the source: the repo is public.
        let url = (Bundle.main.object(forInfoDictionaryKey: "CGLicenceURL") as? String).flatMap(URL.init(string:))
        client = url.map { TvSignInClient(base: $0) }
    }

    func launch() {
        address = PassStore.address
        if let token = PassStore.pass, let p = TvPass.verify(token, publicKey: LicenceKey.production) {
            pass = p
            advance()
            Task { await renewIfDue() }
        } else {
            // An expired or tampered pass is forgotten: it unlocks nothing.
            PassStore.pass = nil
            startSignIn()
        }
    }

    /// A pass within a week of running out is renewed on launch, quietly: a TV with no
    /// internet keeps playing on the pass it has until it runs out (TvPass.swift).
    private func renewIfDue() async {
        guard let client, let p = pass, p.needsRenewal() else { return }
        switch try? await client.renew(pass: p.token) {
        case .renewed(let token)?:
            if let next = TvPass.verify(token, publicKey: LicenceKey.production) {
                PassStore.pass = token
                pass = next
            }
        case .unlinked?:
            // The player unlinked this TV on their phone, or a copy of the pass was seen.
            forgetPass()
        case nil:
            break
        }
    }

    func forgetPass() {
        PassStore.pass = nil
        pass = nil
        startSignIn()
    }

    private func startSignIn() {
        linking?.cancel()
        guard let client else {
            stage = .signIn(code: nil, problem: "This build has no licence address.")
            return
        }
        stage = .signIn(code: nil, problem: nil)
        linking = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    let p = try await linkTv(client: client, publicKey: LicenceKey.production) { code in
                        await MainActor.run { self?.stage = .signIn(code: code, problem: nil) }
                    }
                    PassStore.pass = p.token
                    self?.pass = p
                    self?.advance()
                    return
                } catch is CancellationError {
                    return
                } catch TvSignInError.tooMany(let wait) {
                    self?.stage = .signIn(code: nil, problem: "Too many tries from this network. Trying again shortly.")
                    try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
                } catch {
                    self?.stage = .signIn(code: nil, problem: "Can't reach ChromaGlass. Check the TV's internet.")
                    try? await Task.sleep(nanoseconds: 10_000_000_000)
                }
            }
        }
    }

    func useAddress(_ typed: String) {
        guard let a = RelayAddress(tvAddress: typed) else {
            stage = .address(problem: "That isn't a TV address. It looks like 192.168.1.20:8787/tv?key=ABCDE.")
            return
        }
        PassStore.address = a
        address = a
        stage = .show
    }

    /// The show said the key is wrong: ask for the address again.
    func addressRefused() {
        PassStore.address = nil
        address = nil
        stage = .address(problem: "The Mac didn't accept that key. Type the address it shows now.")
    }

    private func advance() {
        stage = address == nil ? .address(problem: nil) : .show
    }
}
