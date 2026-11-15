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
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.VideoView;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
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
 * With no Mac to be found, "Watch a sample film" plays the channel's films,
 * whole: through YouTube's player first (Sample.FILMS, assets/films.html,
 * 12-tv-2h), and from the site when YouTube will not play (Sample.CLIPS),
 * while the app keeps looking; a Mac that turns up takes over.
 *
 * The logo (the owner, 2026-11-14: "add the logo to the loading screen") is
 * the brand's own mark, res/drawable-nodpi/logo.png, the same file as
 * public/brand/chromaglass-logo-512.png. It heads the list while the app
 * looks for a Mac, and covers the screen while the show's page or a sample
 * film is still loading, which is the only time a TV would otherwise show a
 * black screen: the WebView is black until the page draws, and the platform
 * player is black until its first frame, which for a film streamed from the
 * site is a second or two on a TV's Wi-Fi. Its square's own dark blue is the
 * screen's, so it sits in the screen rather than on it.
 *
 * Back from the show or the sample returns to the list; Back from the list
 * leaves the app.
 *
 * The remote picks the look the Mac plays (PLAN 12-tv-remote): the page
 * reads the D-pad itself (src/components/TvRemote.tsx), since the WebView
 * hands it left, right, up, down and OK as arrow keys and Enter. Two keys it
 * does not reliably get are this app's to pass on: Menu, which opens the
 * page's list of looks, and Back while that list is open, which closes the
 * list instead of leaving the show. The page says when its list is open
 * through `ChromaglassTv.menu`.
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
    /** The page's list of looks is open (Bridge.menu), set from the WebView's thread. */
    private volatile boolean menuOpen = false;
    private Shows.Show playing;
    private Button sampleButton;
    private FrameLayout sampleLayer;
    /** The YouTube films (startFilms), or null while the clips play. */
    private WebView sampleWeb;
    private final Runnable filmsTooSlow = () -> filmsFailed("slow");
    private VideoView sampleVideo;
    private TextView sampleCredit;
    private ImageView sampleLogo;
    private int sampleAt = 0;
    /** Films that would not play one after another; the sample stops when every one has failed (no internet). */
    private int sampleFailed = 0;
    /** The logo over the show's page until the page has loaded (open()). */
    private View opening;

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
        root.setBackgroundColor(BACKGROUND);

        picker = new LinearLayout(this);
        picker.setOrientation(LinearLayout.VERTICAL);
        picker.setGravity(Gravity.CENTER_HORIZONTAL);
        picker.setPadding(dp(64), dp(48), dp(64), dp(48));

        // Smaller over the list than while loading: the list, its button and its help share a TV's 540 dp.
        picker.addView(logo(), new LinearLayout.LayoutParams(dp(LIST_LOGO_DP), dp(LIST_LOGO_DP)));
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
        sampleButton.setOnClickListener(v -> startFilms());
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
        root.addView(siteCorner(), siteCornerParams());
        setContentView(root);
        showList();
    }

    /** The screen's colour: the logo square's own dark blue (its edge pixels), so the square melts into it. */
    static final int BACKGROUND = Color.rgb(2, 16, 31);
    /** The logo's size while loading, about a third of a TV's height, and over the list. */
    static final int LOGO_DP = 168;
    static final int LIST_LOGO_DP = 112;

    private ImageView logo() {
        ImageView v = new ImageView(this);
        v.setImageResource(R.drawable.logo);
        v.setScaleType(ImageView.ScaleType.FIT_CENTER);
        v.setContentDescription("ChromaGlass");
        return v;
    }

    /** The logo and a line under it, centred on the brand's blue: what a TV shows while something loads. */
    private View loadingScreen(String says) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER);
        l.setBackgroundColor(BACKGROUND);
        l.addView(logo(), new LinearLayout.LayoutParams(dp(LOGO_DP), dp(LOGO_DP)));
        TextView t = new TextView(this);
        t.setText(says);
        t.setTextColor(Color.argb(200, 255, 255, 255));
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(20), 0, 0);
        l.addView(t);
        return l;
    }

    /**
     * The website, in the corner of the start screen: a QR code for
     * https://chromaglass.art and a line saying there are more free visuals
     * there (the owner asked for it, 2026-11-14, worded as free visuals and
     * not as a purchase: the app sells nothing and points nowhere to buy).
     * A code and not a link because Android TV has no web browser to open;
     * a phone's camera opens it. Nothing here takes focus, so the remote
     * never lands on it. In the corner, out of the picker's column, so a long
     * list of Macs never pushes it off a 540 dp screen.
     */
    private View siteCorner() {
        LinearLayout corner = new LinearLayout(this);
        corner.setOrientation(LinearLayout.HORIZONTAL);
        corner.setGravity(Gravity.CENTER_VERTICAL);
        corner.setFocusable(false);

        TextView words = new TextView(this);
        words.setText("Try more free visuals at\nchromaglass.art");
        words.setTextColor(Color.argb(170, 255, 255, 255));
        words.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        words.setGravity(Gravity.END);
        words.setPadding(0, 0, dp(12), 0);
        corner.addView(words);

        ImageView code = new ImageView(this);
        code.setImageResource(R.drawable.site_qr);
        code.setContentDescription("QR code for chromaglass.art");
        corner.addView(code, new LinearLayout.LayoutParams(dp(84), dp(84)));
        return corner;
    }

    private FrameLayout.LayoutParams siteCornerParams() {
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.END);
        lp.setMargins(0, 0, dp(32), dp(28));
        return lp;
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
            @Override public void onPageFinished(WebView view, String url) {
                // The page draws its own screen from here (the show, its films or the four digits).
                main.post(() -> hideOpening());
            }
        });
        // Only the show's page is ever loaded (above), so only it can call these.
        web.addJavascriptInterface(new Bridge(show.id), "ChromaglassTv");
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        opening = loadingScreen("Opening the show on " + Shows.label(show.service) + "\u2026");
        root.addView(opening, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        picker.setVisibility(View.GONE);
        web.requestFocus();
        web.loadUrl(Shows.url(show, prefs.getString("key:" + show.id, null)));
    }

    private void hideOpening() {
        if (opening == null) return;
        root.removeView(opening);
        opening = null;
    }

    private void closeShow(String says) {
        menuOpen = false;
        hideOpening();
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

    /**
     * Menu, and Back while the page's list is open, go to the page as the
     * keys it listens for (ContextMenu, Escape), before the WebView or
     * onKeyDown can take them. Both the press and its release are eaten, so
     * a release of Back never reaches the activity as a Back of its own.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (web != null && playing != null && sampleLayer == null
                && (code == KeyEvent.KEYCODE_MENU || (code == KeyEvent.KEYCODE_BACK && menuOpen))) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                web.evaluateJavascript(Shows.pageKey(code == KeyEvent.KEYCODE_MENU ? Shows.KEY_MENU : Shows.KEY_CLOSE), null);
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
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
     * The channel's song films from YouTube (Sample.FILMS, assets/films.html),
     * one after another until Back, over the list. Looking goes on underneath
     * (discovery is not stopped), so a Mac starting its show replaces the
     * sample through open(). A WebView of its own, apart from the show's: the
     * show's WebView stays on the Mac's origin (open()), this one only ever
     * holds the app's own page and the YouTube player that page embeds.
     *
     * If YouTube's player fails, or says nothing for Sample.FILMS_START_MS,
     * the same films play from the site instead (startClips): a TV with no Mac, Play's
     * reviewer's among them, still sees the plate.
     */
    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    private void startFilms() {
        if (sampleLayer != null || playing != null) return;
        String template = asset("films.html");
        if (template == null) { startClips(); return; }
        sampleLayer = new FrameLayout(this);
        sampleLayer.setBackgroundColor(Color.BLACK);
        sampleWeb = new WebView(this);
        sampleWeb.setBackgroundColor(Color.BLACK);
        WebSettings ws = sampleWeb.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        // Nobody presses play on a TV: the films start when the page asks.
        ws.setMediaPlaybackRequiresUserGesture(false);
        sampleWeb.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                // The page never navigates: a tap through to YouTube itself
                // would leave a TV on the open web with no way back but Back.
                return true;
            }
        });
        // Only the app's own page is ever in this WebView (above), so only it can call these.
        sampleWeb.addJavascriptInterface(new FilmsBridge(), "ChromaglassSample");
        sampleWeb.setFocusable(false);
        sampleLayer.addView(sampleWeb, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        // Over the page until YouTube says a film plays, as over the site's
        // films until their first frame: the player is black while it loads.
        sampleLogo = logo();
        sampleLayer.addView(sampleLogo, new FrameLayout.LayoutParams(dp(LOGO_DP), dp(LOGO_DP), Gravity.CENTER));
        root.addView(sampleLayer, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        picker.setVisibility(View.GONE);
        main.postDelayed(filmsTooSlow, Sample.FILMS_START_MS);
        sampleWeb.loadDataWithBaseURL(Sample.FILMS_BASE, Sample.page(template), "text/html", "utf-8", null);
    }

    /** YouTube's player could not play here: the films from the site, played by the app itself, instead. */
    private void filmsFailed(String why) {
        if (sampleWeb == null) return;
        stopSample(null);
        startClips();
    }

    /** What films.html tells the app, from the WebView's thread. */
    final class FilmsBridge {
        @JavascriptInterface
        public void playing() {
            main.post(() -> {
                main.removeCallbacks(filmsTooSlow);
                if (sampleWeb != null && sampleLogo != null) sampleLogo.setVisibility(View.GONE);
            });
        }

        @JavascriptInterface
        public void failed(String why) {
            main.post(() -> filmsFailed(why));
        }
    }

    private String asset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * The same films from the site (Sample.CLIPS), one after another until
     * Back, over the list: the fallback when YouTube's player cannot play
     * (startFilms). VideoView: the platform player plays an H.264 file on
     * every TV this app runs on.
     */
    private void startClips() {
        if (sampleLayer != null || playing != null) return;
        sampleLayer = new FrameLayout(this);
        sampleLayer.setBackgroundColor(Color.BLACK);
        sampleVideo = new VideoView(this);
        sampleLayer.addView(sampleVideo, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        // Over the film until its first frame: a film streamed from the site takes a moment to start.
        sampleLogo = logo();
        sampleLayer.addView(sampleLogo, new FrameLayout.LayoutParams(dp(LOGO_DP), dp(LOGO_DP), Gravity.CENTER));
        sampleCredit = new TextView(this);
        sampleCredit.setTextColor(Color.argb(200, 255, 255, 255));
        sampleCredit.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        sampleCredit.setShadowLayer(dp(3), 0, dp(1), Color.BLACK);
        sampleCredit.setPadding(dp(32), 0, dp(32), dp(24));
        sampleLayer.addView(sampleCredit, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START));
        sampleVideo.setOnCompletionListener(mp -> playClip(Sample.next(sampleAt)));
        sampleVideo.setOnInfoListener((mp, what, extra) -> {
            if (what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) {
                sampleFailed = 0;
                if (sampleLogo != null) sampleLogo.setVisibility(View.GONE);
            }
            return false;
        });
        // One film that will not play is skipped; all of them in a row is no internet.
        sampleVideo.setOnErrorListener((mp, what, extra) -> {
            if (++sampleFailed >= Sample.CLIPS.length) stopSample("Could not play the sample films. Is this TV on the internet?");
            else main.post(() -> playClip(Sample.next(sampleAt)));
            return true;
        });
        root.addView(sampleLayer, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        picker.setVisibility(View.GONE);
        sampleFailed = 0;
        playClip(sampleAt);
    }

    private void playClip(int i) {
        if (sampleVideo == null) return;
        sampleAt = i;
        Sample.Clip c = Sample.CLIPS[i];
        if (sampleLogo != null) sampleLogo.setVisibility(View.VISIBLE);
        sampleCredit.setText("Sample film: " + c.look + " plays " + c.credit
                + "\nBack to look for your Mac");
        sampleVideo.setVideoURI(Uri.parse(c.url));
        sampleVideo.setOnPreparedListener(MediaPlayer::start);
    }

    private void stopSample(String says) {
        if (sampleLayer == null) return;
        main.removeCallbacks(filmsTooSlow);
        if (sampleVideo != null) sampleVideo.stopPlayback();
        if (sampleWeb != null) {
            sampleLayer.removeView(sampleWeb);
            sampleWeb.destroy();
            sampleWeb = null;
        }
        root.removeView(sampleLayer);
        sampleLayer = null;
        sampleVideo = null;
        sampleCredit = null;
        sampleLogo = null;
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
        public void menu(boolean open) {
            menuOpen = open;
        }

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
