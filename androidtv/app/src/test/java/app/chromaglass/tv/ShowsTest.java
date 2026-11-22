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

    // The sample films (Sample.java): each comes from the website over https,
    // never from an address on the LAN, at the address the site redirects to the
    // films' release (firebase.json, /films/), and says what it is playing.
    @Test public void everySampleFilmComesFromTheSiteAndSaysWhatItPlays() {
        assertEquals(6, Sample.CLIPS.length);
        for (Sample.Clip c : Sample.CLIPS) {
            assertEquals(c.url, true, c.url.matches("https://chromaglass\\.art/films/[a-z-]+\\.mp4"));
            assertEquals(c.look, true, !c.look.isEmpty() && c.credit.matches("\u201c.+\u201d, .+ \\(20[0-9][0-9]\\), CC BY 4\\.0"));
        }
    }

    // The YouTube films (Sample.FILMS, 12-tv-2h): each a real YouTube id, no
    // film twice, and each named on screen by its look and its music. Since
    // 34a-6d the music is modern and under CC BY 4.0, not a pre-1926 record,
    // so the old "public domain by its year" bar is gone; in its place every
    // film must be one of CLIPS (the same title, composer and year), the list
    // whose credits name the licence, so no film can carry music the TV does
    // not credit.
    @Test public void everyFilmIsAYouTubeIdWithItsRecordNamed() {
        assertEquals(true, Sample.FILMS.length >= 4);
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (Sample.Film f : Sample.FILMS) {
            assertEquals(f.id, true, f.id.matches("[A-Za-z0-9_-]{11}"));
            assertEquals(f.id, true, ids.add(f.id));
            assertEquals(f.id, false, f.look.isEmpty() || f.title.isEmpty() || f.performer.isEmpty());
            boolean credited = false;
            for (Sample.Clip c : Sample.CLIPS) {
                credited |= c.credit.equals("\u201c" + f.title + "\u201d, " + f.performer + " (" + f.year + "), CC BY 4.0");
            }
            assertEquals(f.id, true, credited);
        }
        assertEquals(true, Sample.FILMS_BASE.startsWith("https://chromaglass.art/"));
    }

    // The page gets the list as JSON where FILMS_JSON stood, every film in it,
    // and nothing in a name can end the script it sits in.
    @Test public void thePageGetsTheListAndNoNameCanBreakOutOfIt() {
        String page = Sample.page("<script>var FILMS = FILMS_JSON;</script>");
        assertEquals(false, page.contains("FILMS_JSON"));
        // Every field under the name films.html reads it by (f.look, f.title, ...):
        // a renamed key would leave the TV's caption saying "undefined".
        for (Sample.Film f : Sample.FILMS) {
            String one = "{\"id\":" + Sample.json(f.id) + ",\"look\":" + Sample.json(f.look)
                + ",\"title\":" + Sample.json(f.title) + ",\"performer\":" + Sample.json(f.performer)
                + ",\"year\":" + f.year + "}";
            assertEquals(f.id, true, page.contains(one));
        }
        assertEquals("\"a\\\"b\\u003c/script>\"", Sample.json("a\"b</script>"));
    }

    @Test public void theSampleGoesRoundAndRound() {
        int i = 0;
        for (int n = 0; n < Sample.CLIPS.length; n++) i = Sample.next(i);
        assertEquals(0, i);
    }

    // The keys the page's remote listens for (src/components/TvRemote.tsx): Menu opens the list, Escape closes it.
    @Test public void menuAndBackReachThePageAsTheKeysItReads() {
        assertEquals("window.dispatchEvent(new KeyboardEvent('keydown',{key:'ContextMenu'}))", Shows.pageKey(Shows.KEY_MENU));
        assertEquals("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))", Shows.pageKey(Shows.KEY_CLOSE));
    }
}
