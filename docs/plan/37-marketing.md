# 37. Marketing and social media: who hears about it, where, and how we know (asked 2026-10-29)

*Asked 2026-10-29: the owner asked for a marketing and social media plan linked from the
plan. It is written from what exists on that day: the prices (§23: the site free, Home $35
and Pro $199 for the Mac app, pay once), the landing page's words (34a-5, shipped), the
hero and share-clip items still open (34a-2, 34f), the free site's 15-second Record with
its corner mark (23.5), the owner's new YouTube channel, and the music-paired look videos
being recorded for the site. Nothing here is measured yet; the numbers to watch are in 37l.*

*Added 2026-10-29, later the same day: the owner agreed to a weekly routine in which the
app films itself and the owner approves once a week (37p to 37w), asked whether the
YouTube side could be automated through its API (37s), and asked for a centrepiece: a
whole album performed every week on YouTube, shown "live" and kept to rewatch, each song
its own look with a common thread through the album (37x).*

**The one line.** "A liquid light show you play to your music" (the landing page's
headline). The angle under it is §36's: what the oil-and-glass operators could not do. No
hot lamp, no spills, no cleaning the plate between songs; it hears the kick, follows MIDI
clock, takes a phone as a remote, and runs on a laptop and one projector. Every post shows
the plate moving with its sound on: a still of a liquid light show sells nothing.

**Who it is for, and what each wants to see.**

| Audience | Tier | What sells it to them | Where they are |
|---|---|---|---|
| VJs and visual artists | Pro | MIDI learn, OSC, Art-Net, several projectors, a show that does not stop | r/vjing, r/TouchDesigner, the Resolume forum, VJ Union, Instagram's VJ scene |
| Musicians, bands and DJs without a VJ | Home, Pro | It plays itself to the music; MIDI clock and sound learn; a phone remote from the stage | r/synthesizers, r/modular, r/WeAreTheMusicMakers, Elektronauts, lines (llllllll.co), ModWiggler, synth YouTube |
| Liquid light show fans | Home | The real look: oil, ink, ferrofluid, the lamp through the dye | #liquidlightshow and #oilwheel on Instagram and TikTok, psychedelic and 60s-revival groups |
| Listeners at home | Home | The Mac plays anything and the TV glows to it, no cables (23.8) | short video ("oddly satisfying", ferrofluid), ambient and vinyl groups |
| Graphics and WebGPU people | (word of mouth) | A real fluid solver in the browser, the source public | Hacker News, r/GraphicsProgramming, r/webgpu |

**What not to claim.** Syphon, NDI and Spout (13.2, 13.3), the DAW bridge (13.7), Windows
(13-win) and the iPhone app (§12) are planned, not built: no post says otherwise until
each ships. No clip uses a song we have no licence for (Content ID takes the video down
or its earnings), except the album show's claimed albums under 37x-1's rule; every
track's licence, or its rights holder, is named in the description. The marketing's
numbers (views, sign-ins, sales) are the owner's and stay in the project's files, never in
this public repository.

## Before any link is posted

These come from the launch runway (2026-10-28) and the go-live order: a visitor sent from
a post sees them in the first minute.

- The store live with Buy buttons on the landing page (#526, #560, the live webhook, #561).
- The share card: `og-card.png` is still the old card (34a-5). Every link posted to Reddit,
  HN, iMessage or Slack shows it, so it is replaced first: the hero's frame, the name and the
  headline, 1200 × 630.
- The filmed hero with its music (34a-2), from the same Mac sitting as the look videos.
- Smooth frames (14aa, #441, #474) and the first load after a deploy (14v): a screen
  recording catches a stutter before anything else.

## Items

- **37a. One name on every channel.** *(S; owner, then Claude.)* The owner holds the
  accounts: YouTube (made), Instagram, TikTok, Threads, Bluesky, Reddit (a person's account, not a brand's;
  Reddit's communities trust people), a Product Hunt maker profile, Hacker News. One handle
  everywhere (`chromaglass`, or `chromaglass.art` where taken), the bio "A liquid light show
  you play to your music. Free in your browser." and a link carrying the channel's tag
  (37l). Claude writes the bios, the YouTube channel's About and banner from a plate frame
  and `brand/`'s logo. The platforms rate-limit or ban new accounts that post by a script
  driving their pages, and the accounts' passwords never leave the owner; what posts on a
  schedule goes through each platform's own API with the owner's one-time sign-in (37r,
  37s). Reddit and the forums are always posted by the owner, by hand.
- **37b. The look videos are the YouTube library.** *(M; Claude on the owner's Mac by
  Remote Control.)* The site's 60-second, music-paired look videos (the "Record music-paired
  look videos for the site" thread) go up as they are: one look, one genre, one licence-free
  track each. Title "ChromaGlass · *Look* · *genre* liquid light show", a description that
  says what the liquid is doing ("the kick lifts the ink, the bass pulls the ferrofluid
  into spikes"), the track, its artist and licence, and the site's link. Three playlists:
  For VJs, For musicians, For listening. Claude writes each title, description, tags and
  thumbnail; the owner uploads, or OKs a batch Claude uploads from the signed-in Mac.
- **37c. Every look video also cut for Shorts, Reels and TikTok.** *(S; Claude.)* A 9:16
  take of the same look, 15 to 30 seconds, filmed in the same Mac sitting as its 60-second
  one: the plate rendered at that aspect (34f's rule), not a crop of the landscape frame.
  The first second already moving, the sound on, a caption line naming the reaction
  (34g's words), no talking needed. Until 34f's one button ships, Claude films these by
  hand; after, any player can, and the free site's corner mark (23.5) rides along.
- **37d. The room shot.** *(S; owner.)* The plate on a real wall in a real room, filmed on
  a phone: a band or a living room, the owner's hands on a MIDI controller or the phone
  remote, the projector's beam in frame. A cloud session cannot make this and nothing
  persuades a VJ more. One a month is enough; each becomes a Short and a pinned post.
- **37e. The maker's face or voice.** *(owner's choice.)* A two-minute "why I built this"
  with the owner on camera or as a voice over the plate. Optional; the repository stays
  nameless either way, and what the channels show of the owner is the owner's call. Claude
  writes a script from the landing page's maker note if wanted.
- **37f. The launch, in order, from the day the store goes live (D0).**
  - *D−7 to D−1*: 37a's accounts made; six look videos and their Shorts uploaded unlisted
    or scheduled; the share card, the hero and the press page (37k) live.
  - *D0*: the store live. The launch video (a 60–90 s cut across four looks, music
    licensed for it) public on YouTube and as a Short, Reel and TikTok; the landing page
    links it.
  - *D+1*: Show HN (37g). *D+2 to D+10*: one community post a day at most, one community
    each (37h), the owner answering every comment that day.
  - *D+14 or later, a Tuesday to Thursday*: Product Hunt (37i), once the first week's bugs
    are fixed and there are first buyers' words to quote.
  - *D+21 on*: the cadence (37j), and 37l's first four-week read.
- **37g. Show HN.** *(S; Claude drafts, owner posts.)* "Show HN: ChromaGlass, a WebGPU
  fluid simulator you play as a liquid light show". The first comment, by the owner, says
  how the plate works (a Hele-Shaw cell, the lamp through the dye, the real ferrofluid
  field: §18, §9), that the source is public, and what is free. Never ask anyone to vote
  (HN penalises it).
- **37h. Communities, one useful post each.** *(S each; Claude drafts, owner posts.)* For
  each community in the table above, Claude first reads its rules on self-promotion (many
  allow it only on set days or from members who take part), then drafts a post that
  stands on its own: a clip with how it was made (r/vjing: a set with the patch shown;
  r/modular: a clock and gates driving the plate, §24; r/GraphicsProgramming: the solver).
  The owner posts from the owner's own account and answers. A community that removes it is not
  posted to again.
- **37i. Product Hunt.** *(S; Claude drafts, owner posts.)* The tagline, the 260-character
  description, a gallery of five frames and the launch video, the maker's first comment
  and the launch offer if there is one (37m). Launched at 12:01 AM Pacific; the owner
  answers comments through the day. No vote-asking here either.
- **37j. The weekly cadence, after launch.** *(Claude makes, owner posts.)* A week is:
  one 60-second look video on YouTube; three 9:16 cuts across Shorts, Reels and TikTok; one
  community or forum post every other week, never the same one twice in a month. Once a
  month, a "New in ChromaGlass" video from the PRs merged that month (the physics items
  in §18, §20, §32 and §36 each make one: a devlog of two or three minutes, written from
  what actually merged, never from what is planned), and the month's room shot (37d).
  Claude keeps the next two weeks drafted in `/mnt/project-files/marketing/` (titles,
  descriptions, clips, captions). Once 37p to 37s run, the owner's part is the Monday
  approval (37q) and answering; once 37x runs, the album is the week's YouTube video and
  its peaks are the week's three cuts.
- **37k. A press page.** *(S; Claude.)* `chromaglass.art/press`: what it is in two
  sentences, the prices, six stills and two clips to download, the logo files from
  `brand/`, `support@chromaglass.art`. For a reviewer, a podcast or a newsletter that
  writes back; built on the phone layout like every page.
- **37l. Knowing what worked.** *(S–M; Claude, with the owner's sign-in for the
  dashboards.)* The site has no analytics today (no counter in `src/` or `index.html`,
  checked 2026-10-29), so nothing says which post sent a buyer. The funnel is views →
  visits → sign-ins → app downloads → purchases, and each step has its own counter:
  - *Views*: YouTube Studio, Instagram and TikTok insights (the owner's dashboards).
  - *Visits by channel*: every posted link carries `?utm_source=<channel>`, read by a
    cookieless counter (Cloudflare Web Analytics is free, sets no cookie and fits the
    Workers already in use), which also needs a line in the privacy page and the page's
    content policy. Built as its own small PR, with a check that the beacon loads only on
    the hosted site.
  - *Sign-ins*: Firebase Authentication's user count, week by week.
  - *Downloads*: the Mac release's download count.
  - *Purchases*: Lemon Squeezy's orders, by discount code where 37m gives one per channel.
  Each Monday, Claude writes the week's numbers into a private file in the project's files
  (never this repository). After four weeks, the owner keeps the two channels with the most
  purchases per hour of the owner's time and drops the rest.
- **37m. A launch offer.** *(owner's call.)* Either none (the price is already pay-once,
  and the landing page says free for good, not a trial) or a code for the first two weeks,
  one code per channel so 37l can count it (for example `HN`, `REDDIT`, `PH`). The store
  makes the codes; Claude puts them in the drafts.
- **37n. Players and creators who get it first.** *(S; Claude lists and drafts, owner
  sends.)* About fifteen people whose audience is one of the table's: VJs who post sets,
  synth YouTubers, liquid-light-show artists. Each gets one personal note from the owner
  and a Pro key (a 100% code, or a key minted by the licence Worker), no ask beyond "tell
  me what breaks". What they post is what 37f's community posts quote.
- **37o. A first visit that plays before it asks.** *(owner's call; from the launch
  runway, 2026-10-28.)* Every marketing click lands on the landing page, and the plate is
  behind a sign-in. Letting a first visit pour for a minute before the sign-in (the looks
  saved only after it) would keep the visitors a post sends. A product change, written here
  because it decides how much the marketing returns; if the owner picks it, it moves to §23
  as its own item, with `npm run signin` held to it and its phone version.

### The week that runs itself (added 2026-10-29)

- **37p. The app films itself, once a week.** *(M; Claude, a routine on the owner's Mac.)*
  37b and 37c's videos are made by a weekly routine instead of a sitting by hand: Claude,
  on the owner's Mac by Remote Control, loads a look and a licence-cleared track (37x-1's
  rules), and makes the 60-second landscape film and three 9:16 cuts with Render this song
  (§6: stepped on the show clock, seeded, no dropped frames), not a screen recording. The
  captions, hashtags, description and a thumbnail (a frame from the film's busiest second,
  chosen by `npm run watch`'s motion numbers) are written beside it in
  `/mnt/project-files/marketing/<week>/`. A render is the same film twice from the same
  seed (#153), so a change asked on Monday re-renders exactly what was asked and nothing
  else. *Measure:* the week's folder holds each file the approval page (37q) lists.
- **37q. One approval page each Monday.** *(S; Claude, an Artifact with a shared
  database.)* The week's videos, captions and post times on one private page that works on
  the phone: Approve, or a line of changes per item. Nothing posts before an approval;
  changes come back as a re-render and a second page. This is the owner's only regular job.
- **37r. A scheduler posts the short cuts.** *(S; owner connects once, Claude loads each
  week.)* Instagram, TikTok, YouTube Shorts, Threads and Bluesky connected once to one
  scheduler (Buffer, Later or Metricool: the owner picks, by which of the five each
  supports on its plan that week), which posts through each platform's own API at the
  approved times. Claude loads the approved week into it from the signed-in Mac. Text-first
  posts (Threads, Bluesky, X) can be drafted directly in Typefully, which has a connector
  Claude can use. The scheduler holds the platforms' sign-ins; no password is ever given
  to Claude or written into the project's files.
- **37s. YouTube by its own API.** *(M; Claude, a script on the owner's Mac; the owner
  makes the Google Cloud project and signs in once.)* The owner asked 2026-10-29 whether
  YouTube could be hooked up so all of this runs itself. The YouTube Data API does most of
  it: upload a video (`videos.insert`) private with a `publishAt` time, set its thumbnail,
  title, description and chapters (timestamps in the description), add it to a playlist,
  schedule a live broadcast and bind a stream to it (`liveBroadcasts`, `liveStreams`), and
  read the comments for 37t. What it cannot do, checked against its reference: mark an
  upload as a **Premiere** (that is a choice in YouTube Studio only, so a Premiere is one
  click in Studio, which Claude can make on the signed-in Mac in the browser); and a new
  API project's uploads are **locked private** until YouTube's API audit passes, a form the
  owner files once and which takes days to weeks. Quota: the default 10,000 units a day,
  an upload costing 1,600, is six uploads a day, far above a week's two or three. The
  script and its tests can live in this repository; the OAuth refresh token lives only in
  the Mac's keychain. It uploads everything private days ahead, so Content ID's checks
  (which run on private uploads too) surface any claim before the video is public.
- **37t. Song requests.** *(S; Claude.)* Each week Claude reads the comments (37s) for
  songs and albums people name, keeps those that pass 37x-1's licence rules in the album
  queue (37x-7), and the video made from one credits whoever asked in its description and
  answers their comment (drafted for the owner, or posted by the owner).
- **37u. Made with ChromaGlass.** *(build: 34f.)* The share button that makes a clip with a
  small corner mark is 34f (and the free site's mark, 23.5). It is the marketing's cheapest
  channel: every buyer's post carries the name. Nothing new here beyond building 34f, with
  its phone version.
- **37v. The real liquid beside the simulation.** *(S; the owner films, Claude cuts.)*
  Split-screen clips: a real dish of oil, water and ink on an overhead projector (or
  ferrofluid under a magnet) on one side, the plate doing the same on the other. They are
  honest only if the real side is the owner's own footage or footage whose licence allows
  it, and only for phenomena the solver really models (§18, §9, §32), named in the caption.
  One a month at most; each is a Short and a community post (37h: r/oddlysatisfying,
  r/GraphicsProgramming).
- **37w. What the owner keeps.** *(owner.)* Creating the accounts and connecting them to the
  scheduler and the API (once); the Monday approval (37q); answering comments in their own
  voice if they want (Claude drafts on request); the room shot (37d); a face or voice if
  ever (37e); and the hand-posted Reddit and forum posts.

### The album show: a whole album every week (added 2026-10-29)

The owner, 2026-10-29: "I would like to record an entire album every week that is hosted
on youtube. Each album has a related set of looks that evolve across the album. Each song
gets its own look, but there should be a common thread that weaves through the
performance. We could even show these 'live' on youtube and then make them available to
rewatch." This becomes the channel's centrepiece: one 30-to-60-minute show a week, each
song a chapter, streamed live at a fixed hour from the owner's Mac (the owner's choice,
37x-4) and kept as a video. The build items are 37x-3 and 37x-4, each its own thread; the
rest is routine and the owner's calls.

- **37x-1. Music the show can use.** *(rules; Claude checks each album.)* An album a week,
  whole, on a channel that sells an app, needs a licence that covers syncing the recording
  to video, commercially, on YouTube and the short-video sites. In order of preference:
  - *An artist or label who says yes in writing* (37x-2): the best, since they share it.
  - *Creative Commons* **CC BY** or **CC BY-SA** albums (Free Music Archive, Jamendo's
    free catalogue, netlabels on the Internet Archive, Bandcamp albums marked CC). Not
    **NC** (the channel promotes a paid app, so it is treated as commercial) and not **ND**
    (CC 4.0 counts music synced to moving images as an adaptation). The licence, the
    artist and a link go in the description; the licence page is saved with the week.
  - *A royalty-free library* (Epidemic Sound, Artlist, Musicbed) on a plan that covers a
    business's channel: albums exist there, though they are library albums.
  - *A bought or streamed copy is not a licence.* The owner asked 2026-10-29 whether
    Qobuz or YouTube Music could be the source: a purchase (Qobuz, iTunes, a Bandcamp
    download without CC) is a licence to listen, not to sync or publish, and YouTube
    Music's terms forbid downloading or reusing its tracks. Once an artist has agreed
    (37x-2), a file bought from Qobuz or Bandcamp is the right audio to render from.
  - *Where the audio comes from, technically.* The owner's choice (37x-4): the album plays
    in Qobuz or YouTube Music on the Mac and the app hears it through system audio, live.
    Neither service gives files (no official way to take the audio out, and the tools that
    do break their terms and break often), so nothing is rendered offline from them. Their
    terms license playback for personal listening, so broadcasting it breaks those terms
    too; the likely cost is the streaming account, while Content ID, not the service,
    decides what happens to the video. A Qobuz or Bandcamp purchase downloads as plain
    FLAC, which the offline render (§6) can read when an album needs a file: a Premiere
    (37x-6) or the clips (37x-9).
  - *Popular albums are not viable on this channel.* The owner asked 2026-10-29 whether a
    licensed album could go up anyway, letting the rights holder take YouTube's earnings.
    Content ID often does exactly that (the label "monetizes" the claim and the video stays
    up), but the choice is the rights holder's, per territory, and can change after the
    video has views: many labels block whole-album uploads outright, a live stream is cut
    off when a claim matches, and a manual takedown is a copyright strike; three strikes
    delete the channel and every look video on it. A single famous song in a short clip is
    the same gamble at a smaller scale.
  - *The owner's answer, 2026-10-29:* "I'm ok with it hitting contentID - I want to
    support the artists." So popular albums can be played, with the rights holder taking
    the earnings, under one rule: each album is uploaded private days ahead (37s), and goes
    public only when every claim on it comes back as *monetize*; a block in any territory,
    or a claim that mutes the audio, means the album is skipped and the next one in the
    queue plays. Where they go is the owner's pick, made the same day: on a **second
    channel**, so a later manual takedown can
    strike only that channel, while the main channel keeps cleared music and artist
    collaborations. Live, there is no private upload to check first: Content ID listens
    during the stream and can cut it off partway (37x-6), so a popular album is a gamble
    each week on the second channel, and an album that was cut off is not tried again.
  - Even a CC track can be claimed, when its artist's distributor registers it in Content
    ID; the licence is the dispute, and an artist who agreed (37x-2) can whitelist the
    channel with their distributor before the show.
- **37x-2. Artists who say yes.** *(S; Claude finds and drafts, the owner sends.)* The
  draw for an artist is a free visual album to share: their record, each song with its own
  look, a film they may post anywhere, with credit and links both ways. If they want
  YouTube's earnings, they keep their Content ID claim on our upload (which the owner is
  happy with) as long as they agree in writing not to block it. Claude lists about twenty
  a month (Bandcamp artists with CC albums, small labels and netlabels in ambient,
  psychedelic, krautrock, jazz and electronic, the genres §10's filmed shows played to),
  drafts each note and a one-page permission (non-exclusive, worldwide, the film and its
  clips on YouTube and the short-video sites, the channel promotional), and the owner sends
  from support@. A yes goes into the queue (37x-7).
- **37x-3. The album's family of looks.** *(build, M–L; its own thread.)* An **album
  sheet** (`*.chromaglass-album.json`, a set list (`setList.ts`) whose items are song shows
  (`songShows.ts`)) holds the tracks in order, each track's licence, and a **thread**: what
  stays and what grows across the album. Each song still gets its own look, applied whole
  (looks never inherit, `lookFade.ts`), but the sheet derives them from one place:
  - *One palette lineage.* An album palette of four or five dyes (five is the plate's most,
    25h); each song takes it a step around the wheel or swaps one dye, never all five, so
    track 7 is recognisably the same record as track 1. The changes land on song
    boundaries, faded, as Evolve already does at a section (`slowEvolve.ts`).
  - *One liquid, one motif.* The album picks its liquid (oil over ink, ferrofluid, soap
    film) and a motif that returns (the title poured at each song's start, a ferrofluid
    pool under the magnet, a ring of lace): one **action set** (`songShows.ts`) laid on
    every song, so the motif comes back on each song's first note.
  - *Something that builds.* One quantity rises over the whole album and peaks near its
    end: a dye absent at track 1 and dominant by the last, the lamp warming, the
    ferrofluid's pool growing a little each song. It is set on the album's clock, not the
    song's, and moves at Evolve's pace (30–90 s glides), never as whole-frame motion.
  - *The plate is not cleared between songs.* The real thread is the liquid itself: what
    song 3 leaves on the glass is where song 4 starts, as an operator's plate would carry
    from one number to the next. A song's look arrives by fading its settings and laying
    new dye over the old (`lookFade.ts`), not by a drain, except where the sheet says a
    track opens on black.
  - *One seed lineage.* The album has a seed and each track's seed is drawn from it and the
    track number (`rng.ts`), so each song starts from the same laid pattern in the
    rehearsal and on the night, and a clip replayed later (37x-9) starts where the show's
    song did. A live show is the same decisions, not the same pixels.
  - The sheet starts from a draft Claude writes from the track list, the songs' lengths
    and a listen to the album (the Mac app's sound readings over each track, saved from the
    rehearsal, 37x-5), and the Design desk opens it for editing. Phone version: the phone's
    Play screen shows the album's tracks as its set list and plays it on the laptop's plate
    (the remote), since a phone does not render.
  *Measure:* a lab check on a three-track sheet that the palette's distance between
  neighbouring songs stays under a bar while track 1 and track 3 differ, that the building
  quantity rises monotonically across the album, and that the plate's dye at a song's
  first frame is the previous song's last.
- **37x-4. Go live to YouTube from the Mac app.** *(build, M; its own thread.)* The owner
  chose 2026-10-29 to play the album from a streaming app and capture it live: "I would
  rather play off of youtube music/qobuz and capture the audio live as the video plays in
  real time. then chromaglass can just record/send to youtube live video&audio together."
  The album plays in Qobuz or YouTube Music; the Mac app hears it through its system-audio
  input (the one-context capture, #550); the album sheet's set list brings each song's look
  up as the song is identified (`setList.ts`'s "which song brings it up"), with the track
  order and lengths as the fallback when identification misses; and the app sends the
  plate's frames and the same audio to YouTube Live itself. A browser page cannot speak
  RTMP, so this is the Mac app's: the canvas and the audio encoded as for Record (WebCodecs,
  `render.ts`'s encoders), and the Mac app's main process speaking RTMPS itself to the
  broadcast's stream key, which 37s creates and binds through the API. (Researched
  2026-10-29, `docs/live-show.md`: a bundled `ffmpeg` was weighed and set aside, 80 MB and
  a pipe of raw frames for what is four hundred lines of FLV and RTMP; a relay such as
  Restream is one more destination, not the design.) Alongside the stream, Record keeps a
  full-quality Plate video of the same show on disk, for the clips (37x-9). Until it is
  built, OBS does the same job: the Wall output (§31) captured as a window, the system
  audio as its input. Phone version: the phone's Play screen shows the album's set list,
  which song is up and whether the stream is live, and can stop it.
  *Measure:* a lab check that a 60-second stream to a local RTMP server arrives with every
  second of audio, frames at the stream's rate within a bound, and audio and plate in sync
  to a frame; on the Mac, `stutter`'s two-step frames while streaming against the same
  look not streaming.
  The owner widened it the same day: every popular platform, several at once, from a Live
  Show panel in the Mac app, Pro only. Built in parts, each its own PR:
  - **37x-4a. The research.** *(shipped 2026-10-29.)* `docs/live-show.md`: which platforms
    take a stream from software (YouTube, Twitch, Facebook, Kick, X with Premium; Instagram
    and TikTok with a key per stream, 9:16 and a follower count; LinkedIn through a tool,
    150 followers), that simulcasting is allowed everywhere since Twitch dropped its rule
    in 2023, and the three designs weighed. YouTube's first enable takes up to 24 hours,
    so the owner enables it before the first show.
  - **37x-4b. The encoder and one destination.** *(shipped 2026-10-29, #577.)* `desktop/live.js`
    (the RTMPS client), `desktop/rtmp.js` (the wire), `desktop/keys.js` (the key store),
    `src/lib/liveStream.ts` (the wall-clock encoder), `window.__cgLive` in the Mac app, and
    `npm run live` against `scripts/rtmpListener.mjs`; story in `docs/plan-shipped.md` §37x-4b.
    Found building it, for the parts after:
    - *The picture is the plate's canvas.* `__cgLive` streams `#liquid-canvas`, the laptop's
      plate, not the projector's pass (§31's Wall output, the mixer's stack). A show with a
      projector up should be able to stream what the wall shows; 37x-4c or 37x-4d takes the
      output pass as the source when one is running.
    - *The sound's clock, on the Mac.* The stream stamps the audio on the track's own
      timestamps, which Chromium puts on `performance.now()`'s clock (measured, the lab);
      the Mac's system-audio path (#550) schedules each captured chunk into a context 5 to
      60 ms after it was heard, so the stream's sound may sit that far behind the plate's
      reaction to it. Measure on the Mac with a clap on camera (judging §92), and if it
      shows, stamp the tap's chunks with the time they were captured.
    - *The encoder's own keyframes.* OpenH264 (the lab) starts a new group whenever the
      picture changes a lot, on top of the one asked for every two seconds; the check allows
      it. VideoToolbox should not; `npm run live` on the Mac shard says.
    - *The app's encoder on GitHub's Mac.* On GitHub's macOS runner (a virtual machine with
      no GPU of its own) the packed app encodes 640x360 at 170 ms a frame under every
      WebCodecs hint (`__cgLive.probe()`: no-preference 171, prefer-software 198 ms, hardware
      unsupported), while the lab's Chromium on the same kind of machine holds 30 fps at
      that size (`npm run live -- --codec aac`, the fifth shard). Electron's build reaches a
      different encoder than Chromium's there; find which (`chrome://gpu`'s video encode
      line in the app, `media_use_openh264` in Electron's build args). The app's check
      line wants the frames the probe says the machine can make, so the runner measures
      the bridge, not its own encoder; judging §92 measures the real rate on the owner's Mac.
    - *Dropping on a slow upload is counted, not yet measured.* The client drops video to
      the next keyframe past 1.5 MB waiting on the socket; the lab's socket never falls
      behind. 37x-4c's listener needs a throttle (read slowly) to measure the drop and the
      recovery, and that no audio packet is lost.
  - **37x-4c. Several destinations, and a vertical one.** *(build, M.)* The same packets
    written to N sockets, a socket that falls behind dropping its own frames (never the
    others'), a reconnect with the key still held; a second encode of a 9:16 crop for
    Instagram and TikTok; the health readout per destination (bitrate out, frames dropped,
    seconds behind, reconnects).
  - **37x-4d. The Live Show panel and the Pro gate.** *(build, M.)* The panel in the Mac
    app's Perform desk: destinations added by name with a pasted key (the key field never
    echoes), orientation per destination, a Test (an unlisted YouTube broadcast), Go live
    and Stop, the health readout, and a warning when the summed bitrate passes the measured
    upload. Pro only through §23's `canUseProFeature`; absent on the website. Phone: the
    Play screen's live state and Stop (`remoteProtocol.ts`), through the relay.
  - **37x-4e. YouTube through the API.** *(build, S; with 37s.)* The broadcast made,
    bound and transitioned from the panel with 37s's token, so the owner never pastes a
    YouTube key; Content ID's cut reported in the health readout.
- **37x-5. A rehearsal for Monday.** *(S; Claude, with 37x-4.)* There are no files to
  render a preview from, so the Monday page (37q) shows the album sheet in a sentence, the
  palette's walk across the tracks as a strip, and a two-to-four-minute rehearsal: the
  first thirty seconds of a few songs played through the same path, recorded as Plate
  video, not streamed. A change asked for one song is re-rehearsed for that song only.
- **37x-6. Showing it live.** *(the owner's choice, made 2026-10-29: live, from the app.)*
  The weekly show is a scheduled YouTube live stream at a fixed evening hour (Pacific
  time), with chat, kept by YouTube as a video to rewatch. What it costs, said when it was
  chosen: the Mac is tied up for the album's length; a stutter or a dropped frame goes out
  as it happened (14aa's smooth frames matter here more than anywhere); the archive is the
  stream's recording at live bitrate, softer than an upload; and Content ID listens during
  the stream, so a matched popular album can be cut off partway. The alternatives stay
  written down for when they fit: a **Premiere** (a finished film uploaded ahead and played
  at a set hour; it needs a file, so it suits the albums bought as FLAC and the artists'
  own), and a **true live set** the owner plays by hand on the desk or the phone (an
  artist's release night, 37x-2).
- **37x-7. The weekly routine.** *(Claude, on the owner's Mac; set up once as a weekly
  routine.)* A queue in `/mnt/project-files/album-show/queue/` holds at least three albums
  ahead, each a folder with the track list, where it streams from, its licence or rights
  holder, and the artist's permission if any. Each week:
  - *Thursday*: Claude takes the next album, writes its album sheet (37x-3) and records the
    rehearsal (37x-5).
  - *Monday*: the approval page (37q): the sheet, the rehearsal, the title, description
    and thumbnail, and last week's three cuts.
  - *Tuesday*: the broadcast scheduled through the API (37s) on the right channel (37x-1),
    its stream key bound, the title, description and a pinned comment with the track list
    and credits ready.
  - *Show night*: Claude, on the Mac by Remote Control, pauses the deploy runner (19ah),
    opens the album in the streaming app, starts the stream from the app (37x-4), starts
    playback, and watches the stream's health until the last track; the owner can be in
    the chat or not. After it ends, chapters are added to the archive's description from
    the times each song came up, and the artist is sent the link.
  - *Sunday*: the three cuts made from the night's Plate video (37x-9) and loaded into the
    scheduler (37r); the comments read for requests (37t); the week's numbers (37l).
- **37x-8. What the owner's week costs.** *(estimate.)* Once: the Google Cloud project
  and its sign-in, the API audit form, the scheduler's connections, the stream permission
  on both channels (YouTube asks a new channel to wait 24 hours before its first live
  stream), and the routine approved. Weekly: the Monday page (10–20 minutes), the artist
  notes to send (a few minutes), and leaving the Mac awake and free on show night. Optional:
  the chat during the show, replies, and playing a set live by hand now and then.
- **37x-9. The album feeds the rest.** *(Claude.)* The night's Plate video (37x-4) shows
  where the album's three biggest moments were; each is played again tall (9:16, 34f's
  rule, not a crop) from its song's look and seed for 15 to 30 seconds, recorded, and
  becomes one of the week's cuts (37c); each
  song's chapter is a link in the cuts' captions; the albums are one playlist ("Albums")
  beside 37b's three. The 60-second look videos (37b) continue less often, as the site's
  library.

## Who does what

| Claude makes | The owner does |
|---|---|
| Look videos and 9:16 cuts on the Mac, by Remote Control | Owns every account and its password |
| The weekly album: its sheet, rehearsal, broadcast and the show on the night (37x) | Approves the week on Monday's page (37q) |
| Titles, descriptions, tags, thumbnails, captions, music credits | Connects the scheduler and the YouTube API once (37r, 37s) |
| Finds cleared albums and drafts the artists' notes (37x-1, 37x-2) | Sends the artists' notes; leaves the Mac free on show night (37x-8) |
| Show HN, Product Hunt, community and creator drafts, each to the place's rules | Answers comments and messages, the same day in launch week |
| The share card, the press page, the launch video's cut | The room shot (37d); a face or voice if wanted (37e) |
| The UTM links, the counter's PR, the Monday numbers file | Picks the launch offer (37m) and 37o; signs in to the dashboards |
