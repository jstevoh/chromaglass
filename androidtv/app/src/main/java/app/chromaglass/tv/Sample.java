package app.chromaglass.tv;

/**
 * The sample films the TV plays with no Mac on the network (PLAN 12-tv-2b).
 *
 * Why the app has them at all: everything else it does needs a Mac running the
 * show on the same Wi-Fi, and both the people who install it before they own
 * the Mac app and Google Play's TV review (which tries every app on a real TV,
 * with no Mac) would otherwise see only "Looking for the show…" forever. Play
 * turns TV apps away for showing nothing, and a person has no idea what the
 * app is for. A sample shows them the plate the app exists to play.
 *
 * They are the press page's two clips (public/press/MEDIA.md): twenty seconds
 * each of the app's own Song films, 1080p H.264 with AAC, `+faststart` so they
 * start before they finish loading, served by the website. Not bundled: 23 MB
 * in the app for a screen most people see once. Nothing is drawn or faked in
 * them; they are the solver's own frames.
 *
 * The music is Kevin MacLeod's under CC BY 4.0, which requires the credit to
 * travel with the sound, so each clip carries its credit and the TV shows it
 * while the clip plays (ShowsTest checks every clip has one).
 */
final class Sample {
    private Sample() {}

    static final String ORIGIN = "https://chromaglass.art";

    static final class Clip {
        final String url;
        final String look;
        final String credit;

        Clip(String path, String look, String credit) {
            this.url = ORIGIN + path;
            this.look = look;
            this.credit = credit;
        }
    }

    static final Clip[] CLIPS = {
        new Clip("/press/clips/neon-coral-reef.mp4", "Neon Coral Reef",
                "Music: “Newer Wave” by Kevin MacLeod (incompetech.com), CC BY 4.0"),
        new Clip("/press/clips/ferro-paint.mp4", "Ferro Paint",
                "Music: “Ethernight Club” by Kevin MacLeod (incompetech.com), CC BY 4.0"),
    };

    /** The clip after `i`, round and round: the sample plays until Back. */
    static int next(int i) {
        return (i + 1) % CLIPS.length;
    }
}
