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

    // The sample films (Sample.java): the music is CC BY, so a clip without its
    // credit would break the licence on every TV that plays it; and the sample
    // must come from the website over https, never from an address on the LAN.
    @Test public void everySampleClipCarriesItsMusicCreditAndComesFromTheSite() {
        assertEquals(true, Sample.CLIPS.length > 0);
        for (Sample.Clip c : Sample.CLIPS) {
            assertEquals(c.url, true, c.url.startsWith("https://chromaglass.art/") && c.url.endsWith(".mp4"));
            assertEquals(c.look, true, c.credit.contains("Kevin MacLeod") && c.credit.contains("CC BY 4.0"));
        }
    }

    @Test public void theSampleGoesRoundAndRound() {
        int i = 0;
        for (int n = 0; n < Sample.CLIPS.length; n++) i = Sample.next(i);
        assertEquals(0, i);
    }
}
