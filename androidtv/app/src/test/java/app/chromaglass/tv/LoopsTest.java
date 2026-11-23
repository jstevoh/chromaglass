package app.chromaglass.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.HashSet;
import java.util.Set;

import org.junit.Test;

/** The calm loops' list and stepping (Loops.java), without a TV: `./gradlew test` in androidtv/. */
public class LoopsTest {
    // Six, each from the website's /loops/ address over https (the redirect to the
    // release is the site's, checked by `npm run presskit`), each named, no id twice.
    @Test public void sixLoopsEachFromTheSiteAndNamed() {
        assertEquals(6, Loops.LOOPS.length);
        Set<String> ids = new HashSet<>();
        for (Loops.Loop l : Loops.LOOPS) {
            assertEquals("https://chromaglass.art/loops/" + l.id + ".mp4", l.url);
            assertTrue(l.id, l.id.matches("[a-z0-9-]+"));
            assertTrue(l.id, !l.title.isEmpty());
            assertTrue("twice: " + l.id, ids.add(l.id));
        }
        // The owner loves the Chemical Clock: it is the one a TV plays first.
        assertEquals("chemical-clock", Loops.LOOPS[0].id);
    }

    // Left from the first is the last and Right from the last is the first: the remote never hits an end.
    @Test public void leftAndRightGoRoundBothWays() {
        int n = Loops.LOOPS.length;
        assertEquals(n - 1, Loops.step(0, -1));
        assertEquals(0, Loops.step(n - 1, 1));
        assertEquals(2, Loops.step(1, 1));
        int at = 0;
        for (int i = 0; i < n; i++) at = Loops.step(at, 1);
        assertEquals(0, at);
    }

    // The kept loop plays again; a kept id no longer in the list (a loop taken out after a TV kept it), or none, is the first.
    @Test public void theKeptLoopComesBackAndAMissingOneIsTheFirst() {
        assertEquals(5, Loops.indexOf("lava-lamp"));
        assertEquals(0, Loops.indexOf("classic"));
        assertEquals(0, Loops.indexOf(null));
    }

    // The line names the loop and says how to change it and how to leave, and nothing about buying.
    @Test public void theCaptionNamesTheLoopAndTheKeys() {
        String c = Loops.caption(2);
        assertTrue(c, c.startsWith("Aurora Borealis"));
        assertTrue(c, c.contains("3 of 6"));
        assertTrue(c, c.contains("Back"));
        assertTrue(c, !c.toLowerCase().matches("(?s).*(buy|price|purchase|licen|upgrade).*"));
    }
}
