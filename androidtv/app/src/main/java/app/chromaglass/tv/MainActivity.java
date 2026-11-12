package app.chromaglass.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.net.Uri;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.VideoView;

import java.net.InetAddress;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ChromaGlass on a TV (PLAN 12-tv-2): find the Mac running the show, and play
 * its plate.
 *
 * The TV draws nothing itself. The Mac sends the plate it drew as WebRTC
 * video to its `/tv` page (src/lib/tvFeed.ts, 12-tv-1), and this app is a
 * WebView on that page with the two things a TV's browser cannot do: find
 * the Mac without anyone typing an address with a remote, and keep the key
 * the Mac handed this TV when it was allowed in.
 *
 * Finding: the Mac's show server advertises `_chromaglass._tcp` over Bonjour
 * (server/bonjour.js); NsdManager finds it and resolves its address and port.
 * The Mac this TV played last opens as soon as it is seen; else, after a few
 * seconds' look, the only one there is; else a list to pick from with the
 * remote's arrows.
 *
 * Pairing is the page's (TvDisplay.tsx): with no key it shows four digits and
 * the Mac shows the same four with Allow. The key then comes back here
 * through `ChromaglassTv.paired`, kept by the show's id from the advert, not
 * by its address, which a router may change any evening.
 *
 * With no Mac to be found, "Watch a sample film" plays the press page's clips
 * (Sample.java) while the app keeps looking; a Mac that turns up takes over.
 *
 * Back from the show or the sample returns to the list; Back from the list
 * leaves the app.
 */
public class MainActivity extends Activity {
    static final String SERVICE_TYPE = "_chromaglass._tcp";
    /** How long the first look lasts before a lone Mac opens by itself. */
    static final long SETTLE_MS = 3000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, Shows.Show> found = new LinkedHashMap<>();
    private final ArrayDeque<NsdServiceInfo> toResolve = new ArrayDeque<>();
    private boolean resolving = false;
    private boolean settled = false;
    private boolean looking = false;

    private NsdManager nsd;
    private NsdManager.DiscoveryListener discovery;
    private SharedPreferences prefs;

    private FrameLayout root;
    private LinearLayout picker;
    private LinearLayout list;
    private TextView status;
    private WebView web;
    private Shows.Show playing;
    private Button sampleButton;
    private FrameLayout sampleLayer;
    private VideoView sampleVideo;
    private TextView sampleCredit;
    private int sampleAt = 0;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences("shows", MODE_PRIVATE);
        nsd = (NsdManager) getSystemService(NSD_SERVICE);
        buildViews();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
        if (playing == null) startLooking();
    }

    @Override
    protected void onPause() {
        stopSample(null);
        stopLooking();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    // ── The list ────────────────────────────────────────────────────────

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private void buildViews() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(8, 20, 32));

        picker = new LinearLayout(this);
        picker.setOrientation(LinearLayout.VERTICAL);
        picker.setGravity(Gravity.CENTER_HORIZONTAL);
        picker.setPadding(dp(64), dp(48), dp(64), dp(48));

        TextView title = new TextView(this);
        title.setText("ChromaGlass");
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 40);
        picker.addView(title);

        status = new TextView(this);
        status.setTextColor(Color.argb(200, 255, 255, 255));
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, dp(12), 0, dp(24));
        picker.addView(status);

        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setGravity(Gravity.CENTER_HORIZONTAL);
        picker.addView(list, new LinearLayout.LayoutParams(dp(520), LinearLayout.LayoutParams.WRAP_CONTENT));

        sampleButton = new Button(this);
        sampleButton.setText("Watch a sample film");
        sampleButton.setAllCaps(false);
        sampleButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        sampleButton.setTextColor(Color.argb(220, 255, 255, 255));
        sampleButton.setFocusable(true);
        sampleButton.setBackground(rowBackground());
        sampleButton.setOnClickListener(v -> startSample());
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(dp(520), dp(56));
        slp.topMargin = dp(12);
        picker.addView(sampleButton, slp);

        TextView help = new TextView(this);
        help.setText("Open the ChromaGlass app on your Mac, on the same Wi-Fi as this TV, and start the show. "
                + "The first time, the TV shows four digits: press Allow on the Mac. "
                + "No Mac yet? The sample film shows what the TV will play.");
        help.setTextColor(Color.argb(140, 255, 255, 255));
        help.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        help.setGravity(Gravity.CENTER);
        help.setPadding(0, dp(32), 0, 0);
        picker.addView(help, new LinearLayout.LayoutParams(dp(560), LinearLayout.LayoutParams.WRAP_CONTENT));

        root.addView(picker, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        showList();
    }

    private void showList() {
        list.removeAllViews();
        for (Shows.Show s : found.values()) {
            Button b = new Button(this);
            b.setText(Shows.label(s.service));
            b.setAllCaps(false);
            b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
            b.setTextColor(Color.WHITE);
            b.setFocusable(true);
            b.setBackground(rowBackground());
            b.setOnClickListener(v -> open(s));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
            lp.bottomMargin = dp(12);
            list.addView(b, lp);
        }
        if (found.isEmpty()) {
            status.setText("Looking for the show on this network…");
            sampleButton.requestFocus();
        } else {
            status.setText(found.size() == 1 ? "Found the show:" : "Pick the show to play:");
            list.getChildAt(0).requestFocus();
        }
    }

    /** A row the remote's focus can be seen on: lit when focused, dim when not. */
    private android.graphics.drawable.StateListDrawable rowBackground() {
        GradientDrawable on = new GradientDrawable();
        on.setCornerRadius(dp(14));
        on.setColor(Color.argb(90, 120, 220, 255));
        on.setStroke(dp(3), Color.WHITE);
        GradientDrawable off = new GradientDrawable();
        off.setCornerRadius(dp(14));
        off.setColor(Color.argb(40, 255, 255, 255));
        android.graphics.drawable.StateListDrawable d = new android.graphics.drawable.StateListDrawable();
        d.addState(new int[] { android.R.attr.state_focused }, on);
        d.addState(new int[] { android.R.attr.state_pressed }, on);
        d.addState(new int[] {}, off);
        return d;
    }

    // ── Finding the Mac ─────────────────────────────────────────────────

    private void startLooking() {
        if (looking) return;
        looking = true;
        settled = false;
        main.postDelayed(() -> { settled = true; maybeOpen(); }, SETTLE_MS);
        discovery = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String type) {}
            @Override public void onDiscoveryStopped(String type) {}
            @Override public void onStartDiscoveryFailed(String type, int code) {
                main.post(() -> status.setText("Could not look on this network (error " + code + ")."));
            }
            @Override public void onStopDiscoveryFailed(String type, int code) {}
            @Override public void onServiceFound(NsdServiceInfo info) {
                main.post(() -> { toResolve.add(info); resolveNext(); });
            }
            @Override public void onServiceLost(NsdServiceInfo info) {
                main.post(() -> { if (found.remove(info.getServiceName()) != null && playing == null) showList(); });
            }
        };
        try {
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discovery);
        } catch (RuntimeException e) {
            status.setText("Could not look on this network.");
        }
    }

    private void stopLooking() {
        main.removeCallbacksAndMessages(null);
        if (!looking) return;
        looking = false;
        try { nsd.stopServiceDiscovery(discovery); } catch (RuntimeException ignored) { /* already stopped */ }
        toResolve.clear();
        resolving = false;
    }

    /** NsdManager resolves one service at a time; the rest wait their turn. */
    @SuppressWarnings("deprecation")
    private void resolveNext() {
        if (resolving || toResolve.isEmpty()) return;
        resolving = true;
        NsdServiceInfo next = toResolve.poll();
        nsd.resolveService(next, new NsdManager.ResolveListener() {
            @Override public void onResolveFailed(NsdServiceInfo info, int code) {
                main.post(() -> { resolving = false; resolveNext(); });
            }
            @Override public void onServiceResolved(NsdServiceInfo info) {
                InetAddress a = info.getHost();
                String host = a == null ? null : a.getHostAddress();
                Map<String, byte[]> attrs = info.getAttributes();
                main.post(() -> {
                    resolving = false;
                    if (host != null && info.getPort() > 0) {
                        found.put(info.getServiceName(), new Shows.Show(info.getServiceName(), host, info.getPort(),
                                Shows.txt(attrs, "id"), Shows.txt(attrs, "path")));
                        if (playing == null) { showList(); maybeOpen(); }
                    }
                    resolveNext();
                });
            }
        });
    }

    private void maybeOpen() {
        if (playing != null) return;
        Shows.Show s = Shows.autoOpen(new ArrayList<>(found.values()), prefs.getString("last", null), settled);
        if (s != null) open(s);
    }

    // ── Playing ─────────────────────────────────────────────────────────

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    private void open(Shows.Show show) {
        // A Mac found while the sample plays takes over: the show is what the sample stood in for.
        stopSample(null);
        stopLooking();
        playing = show;
        prefs.edit().putString("last", show.id).apply();
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        // The plate plays the moment it arrives: nobody presses play on a TV.
        ws.setMediaPlaybackRequiresUserGesture(false);
        final String origin = Shows.origin(show);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                // The show's own page only: a link elsewhere would put the open web on a TV with no way to type.
                Uri u = req.getUrl();
                return !(u.getScheme() + "://" + u.getAuthority()).equals(origin);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) main.post(() -> closeShow("Lost the show on " + Shows.label(show.service) + ". Looking again…"));
            }
        });
        // Only the show's page is ever loaded (above), so only it can call these.
        web.addJavascriptInterface(new Bridge(show.id), "ChromaglassTv");
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        picker.setVisibility(View.GONE);
        web.requestFocus();
        web.loadUrl(Shows.url(show, prefs.getString("key:" + show.id, null)));
    }

    private void closeShow(String says) {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        playing = null;
        found.clear();
        picker.setVisibility(View.VISIBLE);
        showList();
        if (says != null) status.setText(says);
        startLooking();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && sampleLayer != null) {
            stopSample(null);
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_BACK && playing != null) {
            // Back from the show is the list, and forgetting "last" so the
            // list stays up long enough to pick another Mac.
            prefs.edit().remove("last").apply();
            closeShow(null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    // ── The sample film ─────────────────────────────────────────────────

    /**
     * The press clips, one after another until Back, over the list. Looking
     * goes on underneath (discovery is not stopped), so a Mac starting its
     * show replaces the sample through open(). VideoView rather than the
     * WebView: the WebView only ever loads the Mac's own page (open()), and
     * the platform player plays an H.264 file on every TV this app runs on.
     */
    private void startSample() {
        if (sampleLayer != null || playing != null) return;
        sampleLayer = new FrameLayout(this);
        sampleLayer.setBackgroundColor(Color.BLACK);
        sampleVideo = new VideoView(this);
        sampleLayer.addView(sampleVideo, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        sampleCredit = new TextView(this);
        sampleCredit.setTextColor(Color.argb(200, 255, 255, 255));
        sampleCredit.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        sampleCredit.setShadowLayer(dp(3), 0, dp(1), Color.BLACK);
        sampleCredit.setPadding(dp(32), 0, dp(32), dp(24));
        sampleLayer.addView(sampleCredit, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START));
        sampleVideo.setOnCompletionListener(mp -> playClip(Sample.next(sampleAt)));
        sampleVideo.setOnErrorListener((mp, what, extra) -> {
            stopSample("Could not play the sample film. Is this TV on the internet?");
            return true;
        });
        root.addView(sampleLayer, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        picker.setVisibility(View.GONE);
        playClip(sampleAt);
    }

    private void playClip(int i) {
        if (sampleVideo == null) return;
        sampleAt = i;
        Sample.Clip c = Sample.CLIPS[i];
        sampleCredit.setText("Sample film: " + c.look + " \u00b7 " + c.credit
                + "\nBack to look for your Mac");
        sampleVideo.setVideoURI(Uri.parse(c.url));
        sampleVideo.setOnPreparedListener(MediaPlayer::start);
    }

    private void stopSample(String says) {
        if (sampleLayer == null) return;
        sampleVideo.stopPlayback();
        root.removeView(sampleLayer);
        sampleLayer = null;
        sampleVideo = null;
        sampleCredit = null;
        if (playing == null) {
            picker.setVisibility(View.VISIBLE);
            showList();
            if (says != null) status.setText(says);
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    /** What the page tells the app (src/lib/tvKey.ts): the key the Mac handed this TV, or that it stopped working. */
    final class Bridge {
        private final String showId;

        Bridge(String showId) { this.showId = showId; }

        @JavascriptInterface
        public void paired(String key) {
            if (key != null && Shows.TV_KEY.matcher(key).matches()) prefs.edit().putString("key:" + showId, key).apply();
        }

        @JavascriptInterface
        public void forget() {
            prefs.edit().remove("key:" + showId).apply();
        }
    }
}
