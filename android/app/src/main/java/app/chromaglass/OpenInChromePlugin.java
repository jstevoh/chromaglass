package app.chromaglass;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens the website's show in Chrome (PLAN 12-ctl-3), for a phone whose web
 * view has no WebGPU.
 *
 * Android's WebView gets WebGPU on fewer phones than Chrome does, so a phone
 * that cannot draw the plate inside the app can often draw it in Chrome. A
 * plain https link from the app would go to the phone's default browser,
 * which on many phones is not Chrome (Samsung Internet, Firefox) and may have
 * no WebGPU either, so this names Chrome's package. A phone without Chrome
 * gets the default browser rather than nothing.
 *
 * Only https addresses are opened: the page asks with the site's own show
 * address, and nothing else needs to leave the app this way.
 */
@CapacitorPlugin(name = "OpenInChrome")
public class OpenInChromePlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("Only an https address is opened");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.setPackage("com.android.chrome");
        JSObject ret = new JSObject();
        try {
            getActivity().startActivity(intent);
            ret.put("browser", "chrome");
        } catch (ActivityNotFoundException noChrome) {
            intent.setPackage(null);
            try {
                getActivity().startActivity(intent);
                ret.put("browser", "default");
            } catch (ActivityNotFoundException none) {
                call.reject("No browser on this phone");
                return;
            }
        }
        call.resolve(ret);
    }
}
