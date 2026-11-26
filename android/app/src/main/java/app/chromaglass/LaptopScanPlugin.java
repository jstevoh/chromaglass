package app.chromaglass;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.MlKitException;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

/**
 * Reads the laptop's QR code for the Laptop remote form (PLAN 12-ctl-2).
 *
 * The Phone · iPad panel on the laptop draws a QR code that says the Phone
 * line, the same text `npm run remote` prints (src/lib/qr.ts). Typing that
 * line on a phone, key and all, is the slowest part of setting up a show; a
 * scan is one tap.
 *
 * This is Google's code scanner from Play services, not ML Kit's bundled
 * scanner or a camera view of our own. The scanner runs in Play services'
 * own screen, so the app needs no CAMERA permission and asks for none: the
 * person sees Google's camera screen, points it at the code, and the text
 * comes back. Play services downloads the scanner the first time any app
 * asks for it; the manifest's `barcode_ui` line asks for it at install, so
 * the first scan at a show does not wait on a download.
 *
 * Why not the community ML Kit plugin both shells could share: on iOS it
 * installs through CocoaPods only, and the iPhone app is a Swift Package
 * Manager project (ML Kit ships no Swift package). Two small local plugins,
 * this and LaptopScan.swift, keep both shells on what they already use.
 *
 * The plugin hands back the raw text and nothing else. Whether it is a
 * laptop's address is decided in the page (lib/appLink.ts, parseScannedCode),
 * by the same rules the typed field uses, so both shells refuse the same
 * codes in the same words. A cancel resolves rather than rejects: backing
 * out of the camera is a choice, not an error to show.
 */
@CapacitorPlugin(name = "LaptopScan")
public class LaptopScanPlugin extends Plugin {

    @PluginMethod
    public void scan(PluginCall call) {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(getActivity(), options);
        scanner.startScan()
            .addOnSuccessListener(barcode -> {
                JSObject ret = new JSObject();
                ret.put("text", barcode.getRawValue() == null ? "" : barcode.getRawValue());
                call.resolve(ret);
            })
            .addOnCanceledListener(() -> {
                JSObject ret = new JSObject();
                ret.put("cancelled", true);
                call.resolve(ret);
            })
            .addOnFailureListener(e -> {
                // UNAVAILABLE is Play services still fetching the scanner,
                // which happens once, on a phone that installed the app
                // offline. Anything else is a phone without Play services.
                boolean fetching = e instanceof MlKitException
                    && ((MlKitException) e).getErrorCode() == MlKitException.UNAVAILABLE;
                call.reject(fetching
                    ? "The scanner is still downloading. Try again in a moment."
                    : "This phone cannot scan codes. Type the laptop's address instead.");
            });
    }
}
