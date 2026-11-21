package app.chromaglass;

import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * The Android app's one window (PLAN 12-ctl-3): the same bundled build as the
 * iPhone app, in Capacitor's WebView.
 *
 * Two things the page cannot do for itself inside a WebView, done here:
 *
 * The screen stays on. On the website the show asks for a wake lock while it
 * plays (src/hooks/useWakeLock.ts), but Android's WebView has no Screen Wake
 * Lock API, so a phone left as a pocket plate or held as the remote would dim
 * and lock mid-song. The flag holds only while this window is in front, which
 * is when the app is either playing or being the remote; it lets go the
 * moment the app is left.
 *
 * The plate fills the screen. The status and navigation bars are hidden, and
 * a swipe from an edge brings them back for a moment (the behaviour video
 * players use), so a thumb can still leave the app. Hiding them again when the
 * window regains focus covers the return from a notification or the app
 * switcher, which shows them.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OpenInChromePlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.systemBars());
    }
}
