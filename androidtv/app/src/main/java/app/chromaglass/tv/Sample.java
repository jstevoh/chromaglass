package app.chromaglass.tv;

/**
 * The sample films the TV plays with no Mac on the network (PLAN 12-tv-2b,
 * since 12-tv-2f the channel's films, whole, and since 12-tv-2h those same
 * films through YouTube's player first).
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
 *
 * Since 12-tv-2h (the owner had asked for the YouTube films first) the sample
 * tries YouTube's own player before these files: FILMS below, the same six by
 * their YouTube ids, played one after another in a WebView (assets/films.html,
 * MainActivity.startFilms()), so a TV YouTube serves gets YouTube's adaptive
 * streams. When YouTube's player cannot play (no network to it, a film taken
 * down, error 150/152/153 in a WebView it refuses, or nothing for
 * FILMS_START_MS) the page says so and CLIPS, the same films from the
 * website, play instead; so Play's reviewer on a TV with no Mac still sees
 * the plate either way.
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

    static final class Film {
        final String id;
        final String look;
        final String title;
        final String performer;
        final int year;

        Film(String id, String look, String title, String performer, int year) {
            this.id = id;
            this.look = look;
            this.title = title;
            this.performer = performer;
            this.year = year;
        }
    }

    static final Film[] FILMS = {
        new Film("nIzxLuUu8tk", "Neon Coral Reef", "Tears", "King Oliver's Creole Jazz Band, with Louis Armstrong", 1923),
        new Film("j7afUdmWi2c", "Splodascope", "Riverboat Shuffle", "The Wolverine Orchestra, with Bix Beiderbecke", 1924),
        new Film("WbqOB_OeEoM", "Aurora Borealis", "Whispering", "Paul Whiteman and His Ambassador Orchestra", 1920),
        new Film("ij4wuO7HQH8", "Velvet Underground", "Careless Love Blues", "Bessie Smith, with Louis Armstrong", 1925),
        new Film("6SIl6gNhcpE", "Galaxy", "Prelude in C-sharp minor", "Sergei Rachmaninoff", 1921),
        new Film("9N4GEV-z2KE", "Solar Flare", "Vesti la giubba", "Enrico Caruso", 1907),
    };

    /**
     * The page's address as YouTube sees it (its Referer). Nothing is fetched
     * from it: the page is the app's own asset, loaded with this as its base.
     */
    static final String FILMS_BASE = ORIGIN + "/tv/films";

    /**
     * How long the films get to start before the clips take over. YouTube's
     * player on a slow TV takes a few seconds to load its script and buffer
     * the first film; a player that says nothing for this long is not coming.
     */
    static final long FILMS_START_MS = 20_000;

    /** films.html with the list put in for its one FILMS_JSON. */
    static String page(String template) {
        StringBuilder j = new StringBuilder("[");
        for (int i = 0; i < FILMS.length; i++) {
            Film f = FILMS[i];
            if (i > 0) j.append(',');
            j.append("{\"id\":").append(json(f.id))
                .append(",\"look\":").append(json(f.look))
                .append(",\"title\":").append(json(f.title))
                .append(",\"performer\":").append(json(f.performer))
                .append(",\"year\":").append(f.year).append('}');
        }
        return template.replace("FILMS_JSON", j.append(']').toString());
    }

    /** A JSON string, with < escaped too so no name could close the script. */
    static String json(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c == '<') b.append("\\u003c");
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    /** The clip after `i`, round and round: the sample plays until Back. */
    static int next(int i) {
        return (i + 1) % CLIPS.length;
    }
}
