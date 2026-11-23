import SwiftUI

/// The corner that points at the website (PLAN.md 12-promo-1): the words and a QR code for
/// https://chromaglass.art, at the bottom right of every screen that is not the picture.
///
/// The owner asked on 2026-11-14 for "sufficient advertisements" in every app pointing at
/// the website to "try more free chromaglass.art visuals", and not at buying: so no price,
/// no tier, no "buy". The Google TV app's start screen carries the same words and the same
/// code (androidtv MainActivity's siteCorner), and the phone apps a tappable link
/// (src/components/SiteLink.tsx). A TV has no browser, so the code is the link: a phone's
/// camera opens the site from across the room.
///
/// Never over the live plate. The show is a picture people watch for an hour, and a code in
/// its corner would be in every frame; the corner shows on the address screen and over the
/// black screen while the receiver is looking for the Mac (ShowView), the moments someone
/// is looking at the TV with nothing to watch yet. Not on the sign-in screen either: that
/// screen's own big code is the one to scan there (it opens chromaglass.art/?tvlink, the
/// site itself), and a second code beside it would be scanned by mistake.
///
/// The code is drawn by CoreImage's generator (QR in ChromaGlassTVApp.swift) rather than
/// shipped as a picture, so it is the URL in this file and nothing can drift from it.
struct SiteCorner: View {
    static let site = URL(string: "https://chromaglass.art")!

    var body: some View {
        HStack(alignment: .center, spacing: 24) {
            Text("Try more free visuals at\nchromaglass.art")
                .font(.callout)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.white.opacity(0.7))
            if let qr = QR.image(Self.site) {
                // White quiet zone around the modules: a phone reads a QR on a black screen
                // only if the code carries its own light border.
                Image(decorative: qr, scale: 1).interpolation(.none).resizable()
                    .frame(width: 150, height: 150)
                    .padding(10)
                    .background(.white, in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(.trailing, 60)
        .padding(.bottom, 50)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Try more free visuals at chromaglass.art")
    }
}
