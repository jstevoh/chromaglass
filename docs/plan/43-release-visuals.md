# 43. Visuals for a musician's release (asked 2026-11-07)

Asked 2026-11-07, from the revenue research the same day: sell musicians the looping and
full-length visuals a release now needs (a Spotify Canvas, a YouTube visualizer, vertical
cuts for Shorts, Reels and TikTok), either as something the app renders itself or as a
done-for-you service. **The owner picked the shape on 2026-11-07 (43-0): the Release kit in
Home first, then a small done-for-you test.**
The research behind it, with its sources, is in the owner's shared files
(`research/release-visuals-2026-11-07.md`); the numbers below are the ones the plan rests on.

**What a release asks for.** Spotify Canvas: 9:16, 3 to 8 seconds, 720 to 1080 px tall,
MP4, looping, no lyrics or speech, no intense flashing, nothing important at the edges
(Spotify's Canvas guidelines). YouTube "visualizer": the whole track, 16:9, 1080p or 4K,
with the audio. Shorts, Reels, TikTok: 9:16 at 1080x1920 with the audio, 15 to 60 seconds
in practice (Shorts allow 3 minutes). Apple Music album motion: albums and EPs only, a
square and a 3:4 loop of equal length whose first frame matches the cover, 8 to 35 seconds,
delivered through the distributor, with codec rules that the distributors' own pages
disagree on (H.264 or ProRes).

**What the app already does.** Render a song (§6) is half of it: a frame-exact, offline
film of the loaded song at 720p, 1080p or 4K, 16:9 only, unmarked in the app, and the
terms already give the person the renders for monetised use (`public/terms.html` §4). That
is a YouTube visualizer today. What it lacks for the rest: a portrait or square plate (the
live stream's portrait is a crop, 37x-4c; 34f asks for the plate rendered at 9:16, and
#538's Record frame is open and stalled), a seamless loop of a few seconds, a cut of the
song's best part, and a palette from the cover.

**What the market pays.** Self-serve visualizer sites are cheap: SongRender sells one
1080p video for $5, five for $20, twelve for $40, or $15 to $30 a month, and its maker
reports about $700 a month in revenue (Indie Hackers); Videobolt, Renderforest, Specterr,
Neural Frames and Kaiber sit between about $6 and $40 a month; DistroKid gives its
members a stock-clip Canvas maker free. Done-for-you is where $20 to $100 a track lives:
Fiverr's Canvas gigs run about $10 to $50 at the bottom, $50 to $100 in the middle and
$200 to $400 at the top. So a per-track charge of $20 to $100 is a service price; a
self-serve render competes with $5.

**Why it could sell.** About 106,000 new tracks reached the streaming services every day
in 2025 (Luminate year-end), most of them from people with no video budget. Spotify says
a good Canvas has lifted streams by up to 120 % and saves by up to 114 %; its own 2021
study measured smaller averages (5 % more streams, 145 % more shares, 20 % more playlist
adds). None of the templated tools render a fluid that moves with the song frame by frame
from a real solver, in 4K, with no subscription and no mark, which the app already does.

**Physics.** A real fluid does not repeat, so a seamless loop is an edit of the finished
film, never of the plate: find two frames a loop length apart that nearly match, and
crossfade the film's own frames across the seam. The plate shader is untouched and fakes
nothing. A loop that needs less of a crossfade (a periodic stir locked to the bar) is 43b-2.

## Items

- **43-0. The owner's call: who renders it, and in which tier.** **Decided 2026-11-07:
  (a), then (b).** The Release kit goes in Home with no per-track charge, and once it ships,
  the done-for-you test at about $49 a single and $129 an EP, capped at ten orders a month
  (43f); (c) is not built. Three shapes, from the
  research: (a) a self-serve **Release kit** in the app, in Home, with no per-track
  charge ("every release's visuals for $35, once"); (b) a done-for-you **Render for
  release** service at about $49 a single and $129 an EP, fulfilled with (a) on the
  owner's Mac and approved by the owner before it is sent; (c) a per-track unlock on the
  free site at $5 to $9. The research recommends (a) first and (b) as a small paid test on
  top of it; (c) adds a third way to pay and is priced against SongRender's $5.
- **43a. Portrait and square renders.** *(S.)* Render offers 1080x1920, 720x1280 and
  1080x1080 beside the landscape sizes: the plate rendered at that aspect, not a crop
  (34f's rule), the free site still capped at 720 px tall with its mark. Phone: the
  phone has no Render today (only Record, in `PhonePlay.tsx`); 43c brings it there.
  Found 2026-11-07: `RENDER_SIZES` already offers Square 1080 and Vertical 1080, and the
  plate fits its dish at any aspect (`layerDish`, `src/gpu/wgsl/plate.ts`), so what is left
  is the free site's 720x1280 (its short side under the cap) and the check below, which
  is Claude's and not yet written; the size goes in with 43c's brief.
  *Measure:* a new check renders two seconds at 1080x1920 and reads back an MP4 of
  exactly that size whose plate reaches all four edges (no letterbox rows of black), on
  the Mac shard; `panel` for the new choice.
- **43b. A seamless loop, for a Canvas.** *(M, in flight.)* A Loop length (3 to 8 s, default 8) in
  Render: it renders the loop plus a search window, picks the pair of frames one loop
  apart with the least difference, crossfades the film's last half second into its first,
  and writes H.264 MP4 with no audio track, from the song's loudest stretch by the offline
  bands (§6) unless a start is typed. In a module beside `useSongRendering.ts`, not in it.
  *Measure:* `npm run loopseam`, **written 2026-11-07, owed until 43b ships**. Its judge
  reads the finished MP4: 3 to 8 s, no audio track, it moves (first frame to the middle
  more than 4 times the median step), and the seam (last frame to first) at most **3**
  times the median frame-to-frame step, and no cut inside (no step over 8 times the
  median, which a "crossfade" that switches at once fails), on frames shrunk to 16x16 grey. 3 and not the 1.5
  first written here, measured on the check's made-up film: a loop whose seam is exactly
  one step before encoding reads 1.7 to 2.0 times the median after H.264 at crf 18 and
  2.6 at crf 23, because the codec's error is carried from frame to frame but not from
  the last frame back to the first; a cut reads about 50 times. The judge is shown, on
  films it makes with ffmpeg, to fail a cut, a hidden cut, a sound track, a 10 s loop and
  a still picture, and runs now on ubuntu; `-- --file=x.mp4` judges any film (43c, 43f). Owed: `picker`, the node lines of
  `src/lib/loopSeam.ts` (`frameDistance`, `pickSeam(thumbs, loopFrames, fadeFrames)`,
  `fadeWeight(t, fadeFrames)`; the contract is the check's header) on made-up frames,
  on ubuntu; and `loop`, on the Mac's `tools` shard, `window.chromaglassRender` with
  `loop: { seconds, crossfade }` handing back the loop and its `startFrame`: a 4 s loop
  with the crossfade passes the judge and lasts 4 s to a frame, the same pick without it
  fails the seam line, and past the fade the two are one film. The PR that builds each
  takes its id out of `--owed` in `scripts/checks.json`.
  - **43b-3.** The crossfade's own frames step about 3.4 times the median on the made-up
    film (the fade carries the whole distance between the two picked frames across half
    a second), which the seam line does not see and the cut-inside line allows up to 8. If the picked pair on a real plate is far
    apart, the fade reads as a blur once a loop: measure the fade's largest step against
    the median on the Mac once 43b renders, and lengthen the fade or search a wider
    window if it shows. Proposed; after 43b.
  - **43b-2.** A periodic stir locked to the bar, so the plate itself comes back close to
    where it started and the crossfade has less to hide. Proposed; after 43b.
- **43c. A Release kit: one choice, every file.** *(M.)* "For a release" in Render makes,
  from the loaded song and look: the 16:9 full-song film (§6 as it is), the 8 s 9:16 Canvas
  loop (43b), and a 30 s 9:16 cut with the audio from the loudest stretch (a fade in and
  out at the ends), named `<song>-canvas.mp4`, `<song>-short.mp4`, `<song>-youtube.mp4`, and
  a note of which file goes where. Phone: "Render for a release" beside the phone's
  Record, calling the same lib function as the desk (a render can take minutes, so it
  says so and keeps the screen awake).
  *Measure:* the check from 43b on the loop, and the cut's length, audio track and size.
- **43d. The cover sets the colours.** *(M.)* A dropped cover picks the look's dyes from
  the cover's own colours, and can be poured in as the first dye (`injectImage`) so a loop
  opens on it, which Apple's motion art asks for. Nothing is painted over the plate.
  *Measure:* the dyes of a plate from a test cover lie within a set distance of the
  cover's main colours, and the first frame of the film is closer to the cover than to a
  plate from the default look.
- **43e. Apple Music motion art.** *(S, after 43c.)* A square and a 3:4 loop of equal
  length from the same render. Before building, settle the codec with the distributors'
  current pages (H.264 versus ProRes, which WebCodecs cannot write).
- **43f. A done-for-you test, if the owner picks (b).** *(S, mostly not code.)* A store
  product for one single and one EP, an order form (the song, the cover, three looks the
  buyer likes from the gallery), and a runbook: Claude renders the kit on the owner's Mac,
  puts it on one page, the owner approves, the buyer gets a link. Capped at ten orders a
  month for the first two months. *Measure:* orders, refunds, and the owner's minutes per
  order, written into the shared files after each month.
- **43g. A page for musicians.** *(S, copy.)* A section of the landing page (§34a) or
  its own page: a song with its three files side by side, what each is for, and the price
  shape the owner picked. §37's musician audience and its channels carry it.
- **43h. Measure the demand before the spend.** *(S, no code.)* Keyword Planner volumes
  for "spotify canvas maker", "music visualizer", "visualizer for my song" and similar
  (the revenue research had 3 of 17 keyword volumes), and 37l's links on the musician
  page so a kit sale is traced to its channel.

**Order.** 43-0, then 43a, 43b, 43c (the release kit is the build); 43h alongside; 43f
only if the owner picks (b); 43d and 43e after the kit is in people's hands.
