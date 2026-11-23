import ChromaGlassTVCore
import CoreImage.CIFilterBuiltins
import SwiftUI

/// The Apple TV app (PLAN.md 12-tv-apple): it plays the Mac's live plate, the same picture
/// the /tv page plays on a Google TV or a browser. Everything that decides anything is in
/// ChromaGlassTVCore, checked by `npm run tvswift`; these views only show its state.
@main
struct ChromaGlassTVApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var phase
    /// The calm loops (CalmLoops.swift) over whatever screen opened them; Menu closes them.
    @State private var loops = false

    var body: some Scene {
        WindowGroup {
            Group {
                switch model.stage {
                case .starting: Color.black
                case .signIn(let code, let problem): SignInView(code: code, problem: problem, onLoops: { loops = true })
                case .address(let problem): AddressView(problem: problem, submit: { model.useAddress($0) }, onLoops: { loops = true })
                case .show:
                    if let address = model.address {
                        ShowView(address: address, onDenied: { model.addressRefused() })
                    }
                }
            }
            .background(Color.black)
            .ignoresSafeArea()
            .onAppear { model.launch() }
            .fullScreenCover(isPresented: $loops) { CalmLoopsView(onClose: { loops = false }) }
        }
    }
}

/// The sign-in screen: the code, big enough to read across a room, and a QR that opens the
/// phone's page with the code filled in. The phone does the sign-in and the TV only waits.
struct SignInView: View {
    let code: TvCode?
    let problem: String?
    let onLoops: () -> Void

    var body: some View {
        VStack(spacing: 48) {
            Text("Link this TV").font(.largeTitle).bold()
            if let code {
                HStack(spacing: 80) {
                    VStack(alignment: .leading, spacing: 24) {
                        Text("Scan the code, or on your phone open").font(.title3).foregroundStyle(.secondary)
                        Text("chromaglass.art/?tvlink").font(.title2).bold()
                        Text("and enter").font(.title3).foregroundStyle(.secondary)
                        Text(code.userCode).font(.system(size: 96, weight: .bold, design: .monospaced))
                    }
                    if let qr = QR.image(code.linkURL()) {
                        Image(decorative: qr, scale: 1).interpolation(.none).resizable()
                            .frame(width: 360, height: 360)
                    }
                }
                Text("Needs a Home or Pro licence.").font(.callout).foregroundStyle(.secondary)
            } else if problem == nil {
                ProgressView()
            }
            if let problem { Text(problem).font(.title3).foregroundStyle(.orange) }
            // Free, with no account (CalmLoops.swift): the one thing a TV with no licence can play.
            Button("Watch a calm loop", action: onLoops)
        }
        .foregroundStyle(.white)
        .padding(80)
    }
}

/// Where the Mac is. tvOS has no camera to read the Mac's QR, so the address is typed
/// (with the remote, or from a phone's keyboard through the Apple TV Remote). Bonjour, so
/// nobody types anything, is PLAN.md 12-tv-apple-1.
struct AddressView: View {
    let problem: String?
    let submit: (String) -> Void
    let onLoops: () -> Void
    @State private var typed = ""

    var body: some View {
        VStack(spacing: 40) {
            Text("Find your Mac").font(.largeTitle).bold()
            Text("On the Mac, open Show Server Details and type the TV address it shows.")
                .font(.title3).foregroundStyle(.secondary).multilineTextAlignment(.center)
            TextField("192.168.1.20:8787/tv?key=ABCDE", text: $typed)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { submit(typed) }
                .frame(maxWidth: 1100)
            Button("Connect") { submit(typed) }
            if let problem { Text(problem).font(.title3).foregroundStyle(.orange) }
            Button("Watch a calm loop", action: onLoops)
        }
        .foregroundStyle(.white)
        .padding(80)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay { SiteCorner() }
    }
}

enum QR {
    static func image(_ url: URL) -> CGImage? {
        let f = CIFilter.qrCodeGenerator()
        f.message = Data(url.absoluteString.utf8)
        f.correctionLevel = "M"
        guard let out = f.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)) else { return nil }
        return CIContext().createCGImage(out, from: out.extent)
    }
}
