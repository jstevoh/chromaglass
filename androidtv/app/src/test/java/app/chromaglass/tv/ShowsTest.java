package app.chromaglass.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.Test;

/** The app's decisions without a TV (Shows.java): `./gradlew test` in androidtv/. */
public class ShowsTest {
    private static final String KEY = "tv-0123456789abcdef0123456789abcdef";
    private final Shows.Show home = new Shows.Show("ChromaGlass on Living Room Mac", "192.168.1.20", 3000, "a1b2c3d4e5f60718", "/tv");
    private final Shows.Show studio = new Shows.Show("ChromaGlass on Studio", "192.168.1.31", 3001, "ffeeddccbbaa9988", "/tv");

    @Test public void theListDropsTheWordTheScreenAlreadySays() {
        assertEquals("Living Room Mac", Shows.label(home.service));
        assertEquals("Someone else's", Shows.label("Someone else's"));
        assertEquals("A ChromaGlass show", Shows.label(null));
    }

    @Test public void theKeptKeyGoesInTheAddress() {
        assertEquals("http://192.168.1.20:3000/tv?app=android&key=" + KEY, Shows.url(home, KEY));
    }

    @Test public void noKeyOrAStrangeOneMeansThePagePairs() {
        assertEquals("http://192.168.1.20:3000/tv?app=android", Shows.url(home, null));
        // The show key's eight digits, or anything not handed out by pairing, is never put in.
        assertEquals("http://192.168.1.20:3000/tv?app=android", Shows.url(home, "12345678"));
        assertEquals("http://192.168.1.20:3000/tv?app=android", Shows.url(home, KEY + "&x=1"));
    }

    @Test public void anIpv6AddressIsBracketed() {
        Shows.Show v6 = new Shows.Show("ChromaGlass on Mac", "fe80::1", 3000, "id", null);
        assertEquals("http://[fe80::1]:3000/tv?app=android", Shows.url(v6, null));
        assertEquals("http://[fe80::1]:3000", Shows.origin(v6));
    }

    @Test public void aPathThatIsNotAPathIsTheTvPage() {
        Shows.Show odd = new Shows.Show("x", "10.0.0.2", 3000, "id", "evil.example/tv");
        assertEquals("http://10.0.0.2:3000/tv?app=android", Shows.url(odd, null));
    }

    @Test public void theMacPlayedLastOpensAtOnce() {
        List<Shows.Show> both = Arrays.asList(home, studio);
        assertSame(studio, Shows.autoOpen(both, studio.id, false));
    }

    @Test public void aLoneMacOpensOnlyOnceTheLookIsOver() {
        List<Shows.Show> one = Collections.singletonList(home);
        assertNull(Shows.autoOpen(one, null, false));
        assertSame(home, Shows.autoOpen(one, null, true));
    }

    @Test public void twoMacsAndNeitherLastIsTheList() {
        assertNull(Shows.autoOpen(Arrays.asList(home, studio), "0000000000000000", true));
        assertNull(Shows.autoOpen(Collections.emptyList(), null, true));
    }

    @Test public void txtValuesAreReadAsText() {
        Map<String, byte[]> attrs = new HashMap<>();
        attrs.put("id", "a1b2c3d4e5f60718".getBytes(StandardCharsets.UTF_8));
        assertEquals("a1b2c3d4e5f60718", Shows.txt(attrs, "id"));
        assertNull(Shows.txt(attrs, "path"));
        assertNull(Shows.txt(null, "id"));
    }
}
