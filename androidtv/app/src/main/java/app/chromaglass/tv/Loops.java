package app.chromaglass.tv;

/**
 * The calm loops (PLAN 12-tv-loops-2): six silent half-hour films a TV plays
 * round and round with no Mac on the network.
 *
 * The owner asked for them, 2026-11-14: "audio free visuals that the appletv
 * and googletv apps can use … 30 minute loops that evolve over time and are
 * calming", and approved the six that were made, 2026-11-15. They are the
 * app's own Render a song of one calm look each, with Evolve on and nothing
 * heard, so what moves is the liquid and nothing else; how they are made and
 * judged is src/lib/tvLoops.ts, the list this one must match (`npm run
 * presskit` holds the two the same, as it does Sample.java and tvFilms.ts).
 *
 * Each file is its own loop: the last twenty seconds of the film are
 * crossfaded into its first, so the platform player's own looping
 * (MediaPlayer.setLooping) comes round with no seam and no cut, and a loop
 * plays until the person picks another or presses Back. Why a loop and not the
 * six in turn: one look is calm; a cut to another look every half hour, from
 * a liquid to a different liquid, is not, and the person can step to another
 * with Left and Right whenever they like. The one they played last plays next
 * time (MainActivity keeps its id).
 *
 * Served from the website's address, which firebase.json sends on to the
 * pre-release `tv-loops-1` with a 302 the platform player follows, so the
 * files can move without a new app.
 */
final class Loops {
    private Loops() {}

    static final String ORIGIN = "https://chromaglass.art/loops/";

    static final class Loop {
        final String id;
        final String title;
        final String url;

        Loop(String id, String title) {
            this.id = id;
            this.title = title;
            this.url = ORIGIN + id + ".mp4";
        }
    }

    static final Loop[] LOOPS = {
        new Loop("chemical-clock", "Chemical Clock"),
        new Loop("clock-glass", "Clock Glass"),
        new Loop("aurora-borealis", "Aurora Borealis"),
        new Loop("jellyfish-bloom", "Jellyfish Bloom"),
        new Loop("velvet-underground", "Velvet Underground"),
        new Loop("lava-lamp", "Lava Lamp"),
    };

    /** The loop `step` places on from `i`, round and round either way (Left is -1, Right +1). */
    static int step(int i, int step) {
        int n = LOOPS.length;
        return ((i + step) % n + n) % n;
    }

    /** Where the loop with this id is in the list; the first for an id no longer in it (a loop taken out after a TV kept it). */
    static int indexOf(String id) {
        if (id != null) {
            for (int i = 0; i < LOOPS.length; i++) if (LOOPS[i].id.equals(id)) return i;
        }
        return 0;
    }

    /** The line over the loop: its name, then how to change it and how to leave. */
    static String caption(int i) {
        return LOOPS[i].title + "  ·  calm loop " + (i + 1) + " of " + LOOPS.length
                + "\n◀ ▶ another loop  ·  Back to look for your Mac";
    }
}
