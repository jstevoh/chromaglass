package app.chromaglass.tv;

/**
 * The sample films the TV plays with no Mac on the network (PLAN 12-tv-2b,
 * and since 12-tv-2f the channel's films, whole).
 *
 * Why the app has them at all: everything else it does needs a Mac running the
 * show on the same Wi-Fi, and both the people who install it before they own
 * the Mac app and Google Play's TV review (which tries every app on a real TV,
 * with no Mac) would otherwise see only "Looking for the show…" forever. Play
 * turns TV apps away for showing nothing, and a person has no idea what the
 * app is for. A sample shows them the plate the app exists to play.
 *
 * What they are (the owner, 2026-11-14, on the first samples: "I don't like
 * the visuals… can we play the YouTube videos as samples? If not YouTube,
 * let's get much better and longer samples"): the six films on the channel,
 * each a look playing a whole 1920s record, two and a half to three and a half
 * minutes, about nineteen minutes round. They were two twenty-second press
 * clips before. The files are the channel's own masters, not YouTube's
 * player: an embedded YouTube player in a TV app's WebView may refuse to play
 * or show an advert first, and this app's WebView only ever loads the Mac's
 * page. src/lib/tvFilms.ts (the TV page's list, which this one must match:
 * `npm run presskit` holds the two the same) says where they are served from
 * and why: `https://chromaglass.art/films/<id>.mp4`, a redirect to a release
 * of the repository, which the platform player follows.
 *
 * Nothing is drawn or faked in them; they are the solver's own frames. The
 * records were published before 1926 and are in the public domain in the US,
 * so no credit is owed, but the TV says what is playing while it plays
 * (ShowsTest checks every film says it).
 */
final class Sample {
    private Sample() {}

    static final String ORIGIN = "https://chromaglass.art";

    static final class Clip {
        final String url;
        final String look;
        final String credit;

        Clip(String id, String look, String title, String performer, int year) {
            this.url = ORIGIN + "/films/" + id + ".mp4";
            this.look = look;
            this.credit = "“" + title + "”, " + performer + " (" + year + ")";
        }
    }

    static final Clip[] CLIPS = {
        new Clip("wolverines", "Splodascope", "Riverboat Shuffle", "The Wolverine Orchestra, with Bix Beiderbecke", 1924),
        new Clip("caruso", "Solar Flare", "Vesti la giubba", "Enrico Caruso", 1907),
        new Clip("rachmaninoff", "Galaxy", "Prelude in C-sharp minor", "Sergei Rachmaninoff", 1921),
        new Clip("whiteman", "Aurora Borealis", "Whispering", "Paul Whiteman and His Ambassador Orchestra", 1920),
        new Clip("oliver", "Neon Coral Reef", "Tears", "King Oliver's Creole Jazz Band, with Louis Armstrong", 1923),
        new Clip("bessie", "Velvet Underground", "Careless Love Blues", "Bessie Smith, with Louis Armstrong", 1925),
    };

    /** The clip after `i`, round and round: the sample plays until Back. */
    static int next(int i) {
        return (i + 1) % CLIPS.length;
    }
}
