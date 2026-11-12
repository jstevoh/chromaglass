package app.chromaglass.tv;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * The app's decisions that need no Android: what a show found on the network
 * is called, which address opens it, and which one to open by itself.
 * Plain Java so `./gradlew test` holds them without a TV (ShowsTest).
 */
final class Shows {
    private Shows() {}

    /** A show found by Bonjour: the Mac's show server (server/bonjour.js). */
    static final class Show {
        final String service;   // the instance name, "ChromaGlass on Steve's Mac"
        final String host;      // an address the TV can reach
        final int port;
        final String id;        // the show's random id from the TXT record, never its key
        final String path;      // where the TV page lives, "/tv"

        Show(String service, String host, int port, String id, String path) {
            this.service = service;
            this.host = host;
            this.port = port;
            this.id = id == null ? "" : id;
            this.path = path == null || !path.startsWith("/") ? "/tv" : path;
        }
    }

    /** A TV's own key, as the show server hands them out (server/tv-pairing.js). */
    static final Pattern TV_KEY = Pattern.compile("^tv-[0-9a-f]{32}$");

    /** "ChromaGlass on Steve's Mac" → "Steve's Mac": the list already says ChromaGlass. */
    static String label(String service) {
        if (service == null || service.isEmpty()) return "A ChromaGlass show";
        String s = service.replace("\\032", " ");
        return s.startsWith("ChromaGlass on ") ? s.substring("ChromaGlass on ".length()) : s;
    }

    /**
     * The TV page at this show, with the key this TV kept for it if there is
     * one (a key only the show could have handed out; anything else is left
     * off, and the page pairs). `app=android` tells the page it is in here.
     */
    static String url(Show show, String key) {
        String host = show.host.contains(":") && !show.host.startsWith("[") ? "[" + show.host + "]" : show.host;
        StringBuilder u = new StringBuilder("http://").append(host).append(':').append(show.port).append(show.path).append("?app=android");
        // The pattern admits only letters, digits and a dash, so it goes in as it is.
        if (key != null && TV_KEY.matcher(key).matches()) u.append("&key=").append(key);
        return u.toString();
    }

    /** The scheme, host and port a page must stay on: the WebView goes nowhere else. */
    static String origin(Show show) {
        String host = show.host.contains(":") && !show.host.startsWith("[") ? "[" + show.host + "]" : show.host;
        return "http://" + host + ":" + show.port;
    }

    /**
     * Which show to open without asking, or null to show the list: the one
     * this TV opened last time, as soon as it is seen; or, once the first look
     * is over (`settled`), the only one there is. Two Macs and neither the
     * last: the list, since guessing would put the wrong house's show up.
     */
    static Show autoOpen(List<Show> found, String lastId, boolean settled) {
        if (lastId != null && !lastId.isEmpty()) {
            for (Show s : found) if (lastId.equals(s.id)) return s;
        }
        if (settled && found.size() == 1) return found.get(0);
        return null;
    }

    /** The TXT record's value for `name`, or null. NSD hands TXT values over as bytes. */
    static String txt(Map<String, byte[]> attrs, String name) {
        if (attrs == null) return null;
        byte[] v = attrs.get(name);
        return v == null ? null : new String(v, StandardCharsets.UTF_8);
    }
}
