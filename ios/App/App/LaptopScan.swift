import AVFoundation
import Capacitor
import UIKit
import VisionKit

/**
 The app's web view, with the app's own plugins registered (PLAN 12-ctl-2).

 Capacitor finds a plugin that comes as a Swift package by itself; a plugin
 written inside the app has to be handed to the bridge, and the bridge is
 ready for that in `capacitorDidLoad`. The storyboard and SceneDelegate both
 name this class, so whichever builds the window, the plugin is there.
 */
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LaptopScanPlugin())
    }
}

/**
 Reads the laptop's QR code for the Laptop remote form (PLAN 12-ctl-2).

 The Phone · iPad panel on the laptop draws a QR code that says the Phone line,
 the same text `npm run remote` prints (src/lib/qr.ts). Typing that line on a
 phone, key and all, is the slowest part of setting up a show; a scan is one
 tap.

 This is VisionKit's DataScannerViewController, Apple's own live scanner: the
 camera view, the highlight on the code and the focus come with it, and it
 needs no package. The community ML Kit plugin was the other way, but on iOS
 it installs only through CocoaPods, and this app is a Swift Package Manager
 project (ML Kit ships no Swift package). The Android app has its own small
 plugin of the same name (LaptopScanPlugin.java), so the page asks both the
 same way.

 The scanner sits in a navigation bar with Cancel, since a full-screen camera
 with no way out is how a performer ends up force-quitting the app at a show;
 a swipe down closes it too. Both resolve with `cancelled`, not an error: backing
 out is a choice. The first code seen is taken and the scanner closes at once.

 The plugin hands back the raw text and nothing else. Whether it is a laptop's
 address is decided in the page (lib/appLink.ts, parseScannedCode), by the
 rules the typed field uses, so both shells refuse the same codes in the same
 words.
 */
@objc(LaptopScanPlugin)
public class LaptopScanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LaptopScanPlugin"
    public let jsName = "LaptopScan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise)
    ]

    private var session: LaptopScanSession?

    @objc func scan(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard DataScannerViewController.isSupported else {
                call.reject("This phone cannot scan codes. Type the laptop's address instead.")
                return
            }
            // Ask for the camera first: until the person answers,
            // `isAvailable` is false for a reason that is not a refusal.
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            guard granted, DataScannerViewController.isAvailable else {
                call.reject("The app may not use the camera. Allow it in Settings, ChromaGlass, Camera, or type the address.")
                return
            }
            guard let host = self.bridge?.viewController else {
                call.reject("The scanner could not open.")
                return
            }
            let session = LaptopScanSession(call: call) { [weak self] in self?.session = nil }
            self.session = session
            session.present(from: host)
        }
    }
}

/** One scan: the camera screen, and the call it answers exactly once. */
@MainActor
final class LaptopScanSession: NSObject, DataScannerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
    private var call: CAPPluginCall?
    private let done: () -> Void
    private weak var nav: UINavigationController?

    init(call: CAPPluginCall, done: @escaping () -> Void) {
        self.call = call
        self.done = done
    }

    func present(from host: UIViewController) {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = self
        scanner.title = "Scan the laptop's code"
        scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(
            systemItem: .cancel,
            primaryAction: UIAction { [weak self] _ in self?.finish(["cancelled": true]) }
        )
        let nav = UINavigationController(rootViewController: scanner)
        nav.presentationController?.delegate = self
        self.nav = nav
        host.present(nav, animated: true) {
            do {
                try scanner.startScanning()
            } catch {
                self.finish(nil, error: "The camera would not start. Type the laptop's address instead.")
            }
        }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        for item in addedItems {
            if case .barcode(let code) = item, let text = code.payloadStringValue {
                finish(["text": text])
                return
            }
        }
    }

    func dataScanner(_ dataScanner: DataScannerViewController, becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) {
        finish(nil, error: "The camera stopped. Type the laptop's address instead.")
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        // A swipe down: the screen is already gone, so only answer.
        answer(["cancelled": true], error: nil)
    }

    private func finish(_ result: [String: Any]?, error: String? = nil) {
        guard call != nil else { return }
        (nav?.viewControllers.first as? DataScannerViewController)?.stopScanning()
        nav?.dismiss(animated: true)
        answer(result, error: error)
    }

    private func answer(_ result: [String: Any]?, error: String?) {
        guard let call else { return }
        self.call = nil
        if let error { call.reject(error) } else { call.resolve(result ?? [:]) }
        done()
    }
}
