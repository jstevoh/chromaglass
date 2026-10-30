# 34. What Photism showed: the page and the app (asked 2026-10-22)

*Asked 2026-10-22: the owner shared a phone screenshot of photism.app (an audio-reactive
visualizer sold at $29 once, as a DAW plugin, a standalone app and a browser version)
and asked what ChromaGlass should change on its page and in the app. The owner said to
put the findings into the plan. Everything below about Photism is from its own page
(fetched 2026-10-22); nothing was run or measured, and its claims are its own.*

**What Photism sells.** One promise in the headline ("Your music, made visible."), one
price button ("Get Photism · $29 once", "no subscription" under it), and a buy-on-the-phone
flow that emails the download link for the computer. A thumbnail grid of about twenty-five
scenes with a watch-with-sound clip; a VST3 and AU plugin that sits on the master bus,
plus a standalone app and a free browser version ("No download · No account"); automation
lanes that play a drawn look across a song; one-button MP4 with the track's audio in
it; Syphon (Mac) and Spout (Windows, beta) for Resolume, OBS, VDMX, MadMapper and
TouchDesigner; new scenes free for life. Proof is a count ("1,000+ users in 82 countries"),
testimonials, a note from its one maker, and a refunds link.

**Where ChromaGlass already stands.** The solver, the Perform and Design desks, MIDI
learn and clock, the phone remote, several projectors and Art-Net are things its page
does not list. Record and Render a Song (§6) already write MP4 with the sound. The DAW
bridge (13.7, with its automatable slots), Syphon (13.2) and NDI and Spout (13.3) are
planned and not built. Pouring a picture into the plate exists (`injectImage`), but a
dropped picture or 3D model driven by the music as its own look does not.

**What not to copy.** A user count before ours is real; a "download link emailed" flow,
because our free site asks for a login and needs its own reason to (saves your looks);
a grid of generic stock thumbnails: ours are the plate itself.

- **34a. A landing page before the sign-in wall.** *Shipped (2026-10-22), first version*: `Landing.tsx` before the sign-in, `npm run signin` holding it; the owner's look is `docs/judging.md` §62. Story in `docs/plan-shipped.md` §34a (moved 2026-10-29, 19m-2).
- **34a-2. A filmed hero with its music, from a Mac.** *(S; owner's Mac. The owner, 2026-10-22: the
  video examples should be better, and should play with the music audibly.)* The hero is a cross-fade of five of
  the app's own frames, because a cloud session cannot film the app and the lab's plate barely
  moves in a hero's seconds. A 10 to 15 second loop of the real show (`npm run film` records
  through `scripts/recorder.mjs`), 1280 wide, under 1.5 MB as WebM and MP4, would replace it: the
  page then loads it after its first paint and keeps the stills for reduced motion. The loop is
  filmed with the track it was filmed to (the recorder takes the audio, and the show's own music in
  `public/music` is ours to use), and a browser will not start sound on its own: the video starts
  muted, and a "Sound on" button (and a tap on the video) unmutes it, with the sound off again when
  the visitor leaves for the sign-in. More than one clip (a ferrofluid, a dye pour, a close macro)
  would be the "video examples" row under the hero, each its own filmed look with its sound.
  *Measure:*
  the loop's first and last frames differ by less than a frame of motion; `npm run signin` 3a still
  true with the plate not up.
- **34a-3. Sharper looks in the grid.** *(S.)* The cards are 480 × 300 frames from the preset
  contact sheets (28i-1) and are soft where a Retina screen draws them at 2x. `pixels.yml` renders
  every look one to one at a laptop's size: take the eight from it and keep the file sizes under
  60 KB each.
- **34a-4. Buy buttons on the landing page.** *(S; built, held for the go-live order.)* The Home
  and Pro cards carry a Buy button to the live Lemon Squeezy checkout (new tab) and the Free card
  Play free; "Buying opens soon" is gone. The links live in `lib/checkoutLinks.ts` (the landing
  chunk imports them without `tierGates.ts`'s sign-in flag and licence reader; `tierGates`
  re-exports them for the account sheet). Live ids, 2026-10-29: Home 1479217, Upgrade 1479218,
  Pro 1479219. `npm run signin` check 11b holds both buttons (44 px, new tab, a lemonsqueezy.com
  checkout address). Merges only after the Worker is deployed with the live ids and the live
  webhook exists (the order in `docs/handoff` for the store go-live). Open: the buyer is asked to
  use their sign-in email, because the Worker keys on the order email; a signed-out visitor's
  button cannot prefill it.
- **34a-4b. The licence Worker refuses test-mode orders; the live store's product ids are settings.**
  *(S; shipped in the go-live PR, Worker deploy owed.)* The webhook never read the order's
  `test_mode`, so while the store is in test mode anyone paying with Lemon Squeezy's published
  test card got a genuine signed key (found reviewing #428, 2026-10-22; open to everyone since
  the account sheet's Buy buttons, #394). A test order now answers 200 and files nothing unless
  the buyer's email is on the `TEST_MODE_EMAILS` Worker secret (the owner proves the path with
  it). `LS_PRO_PRODUCT_IDS` and `LS_UPGRADE_PRODUCT_IDS` (Worker vars, comma separated) name the
  live store's products, which get ids of their own; the test-mode ids stay built in. Go-live
  order: deploy the Worker, set the secret and vars, sweep KV for keys minted from test orders
  (`keys:*` whose `orderId` is a test order), then change the three `CHECKOUT_*_URL`s in
  `src/lib/tierGates.ts` to the live products' links and register the live webhook. `npm run
  license-worker` checks 9 to 9d.
- **34a-5. The owner's words and the share card.** *The words shipped (2026-10-28, the owner's OK
  on a line-by-line draft; story in `docs/plan-shipped.md` §34a-5).* Open: `og-card.png` is still
  the old card; a new one would be the hero's frame with the name and the new headline. The maker
  note goes unsigned unless the owner says otherwise.
- **34a-7. A page for pros (`/pro`).** *(S. The owner, 2026-10-29: a part of the site for VJs,
  synth people, producers and artists, who need the technical capabilities before they pay.)*
  `public/pro.html`, a static page like the Terms (no engine, no Firebase, read whole by a search
  engine), at `/pro` through a `firebase.json` rewrite and linked from the landing's price section
  as `/pro.html`. Sections: sync and control, Ableton and DAWs, sound in, projectors, lights,
  recording, the spec table, a Free / Home / Pro table and a FAQ. Every claim was checked against
  the code and `docs/guide.md` on 2026-10-29; what the plan has and the app does not (Syphon and NDI
  13.2–13.3, the DAW bridge 13.7, Ableton Link and OSC out 13.5, several outputs 36b, patch inputs
  24.1, notes as voices 24.3, YouTube Live 37x-4, Windows 13-win) is marked *on the way*. The same
  check found the landing's Pro card, the Settings tiles (`APP_FEATURE_TILES`) and the upgrade card
  (`RunLocallyCard`) selling "several projectors with edge blending" and "MIDI out", which do not
  ship: the app drives one projector output, mapped into up to sixteen surfaces on every tier, and
  MIDI out is a controller's LEDs. Those lines now name OSC, Art-Net, the 1024² grid and cloud
  sync. Rule: when an item on the page ships or a gate moves, the page changes in the same PR.
  Found along the way:
  - **34a-7a. OSC and Art-Net are Pro.** *Shipped (2026-10-30, the owner's yes on the card of
    2026-10-29; story in `docs/plan-shipped.md` §34a-7a).* `npm run tiers` 4b and 4c.
  - **34a-7h. The Mac app's OSC menu does not know the tier.** The gate is in the show server, so
    a Home licence opens the port from *Show → OSC input (Pro)* and only Show Server Details says
    packets are ignored; the menu could instead show the item disabled with an upgrade line, read
    live from the licence rather than once at start (`show.license` is read once in
    `desktop/main.js`). Not a message box on the pick: on a Mac it is a sheet on the show window,
    and a window with a sheet up did not close, so desktop.yml's packed check hung at quit. Art-Net has no menu at all yet (34a-7c), which is where its Pro
    note would sit.
  - **34a-7b. The Terms' Pro line promises what does not ship.** `public/terms.html` lists
    multi-projector edge blending, Syphon, Spout, NDI and MIDI out under Pro. Legal text, so the
    owner's words: make it name what ships and say the rest arrives as updates.
  - **34a-7c. Art-Net has no panel in the Mac app.** It is set only by `ARTNET_*` environment
    variables when the show server starts, which a Finder launch never sets, though
    `desktop/README.md` says it works "with no terminal". A Show menu item or a Settings → Wall
    card for host, universe, fixtures, order and the in-map, kept in the app's settings.
  - **34a-7d. Network displays cannot start over the Wi-Fi.** A `?cast` page at an `http://`
    address gets no WebGPU (14m-https, #443), so "more screens on other computers" is not sold yet.
  - **34a-7e. The Ableton route, tried end to end on the owner's Mac.** The page tells a Live user
    to send clock and CC over the IAC bus and let the app hear system audio; nobody has run that
    whole route (§13 step 7's note). Build a small Live set that does it, film a minute, and put
    the set beside the page as a download.
  - **34a-7f. The rig's wires, checked without the rig.** **Shipped** (`npm run rig`, `scripts/rig.mjs`):
    the real show server with a Pro key; every OSC address on `/pro`, sent as Resolume, TouchDesigner
    and Max send it, arrives as the message the page acts on; the page's `lights` leaves as an
    ArtDmx universe at the set rate; a desk's universe arrives as settings; and in the built app an
    OSC setting, a desk fader, a MIDI fader (past soft takeover) and a DAW's 120 BPM clock move the
    page, and an OSC setting lights the controller's ring. All 33 lines green: no
    claim on `/pro` was found broken. The plate's colours on the fixture and the blackout on the rig
    need a plate that reports its dye, so they run on the Mac (`RIG_PLATE=1` elsewhere). The
    programs themselves are `docs/judging.md` §93, one sitting with free versions.
  - **34a-7g. Resolume sends its own OSC addresses.** Its OSC output mirrors Resolume's address space
    (`/composition/layers/1/video/opacity`); reaching `/chromaglass/setting/<key>` takes a custom
    output address per control (Shortcuts → Edit OSC), which `/pro` does not say. Either a line on
    the page with the steps, or let the server take a small map of another program's addresses
    onto ours (as `ARTNET_IN` does for channels). Judging §93 step 2 says which.
- **34b. A looks browser with live previews.** *(M.)* A grid of the presets playing
  (paused until hovered or tapped, as Photism's browser does), picked from before the
  desk is opened. Previews run the real shader at a small size and one at a time, so
  the frame budget (Wave 4) is not touched. Phone: the Looks sheet gets the same grid.
  Line 1211 above already asks for a still saved in each preset file; that is the
  cheap first step, and the live preview follows.
- **34c. An analyzer look.** *(M.)* Producers like to see the sound itself: spectrum,
  scope, spectrogram and a stereo goniometer, as a Mixer row (§11) over the plate or
  alone. Built from the same bands the plate already hears. Fast readings only (the
  owner's patch rule). Phone: the same row in the Mixer sheet.
- **34d. Chladni figures from the spectrum.** *(M; real physics.)* A thin plate driven
  at the song's strongest partials shows nodal lines where grains settle; it is the
  phenomenon behind the sand scene Photism lists. §18 tried the glass ringing in a Chladni
  mode and set it aside, so this is a separate look where the plate is the vibrating
  plate, not a ripple on the liquid. Needs a look and a check that the figure matches the
  analytic mode for a held tone (the script to be named in the PR).
- **34e. A drawn automation lane per setting.** *(M–L.)* Photism lets a user draw a
  curve for a setting and play it with the song. §13's DAW bridge covers a DAW's own
  lanes, and the sequencer (§10) covers cues; neither lets a user draw a curve on the
  site. A lane on a song's timeline, bound to a setting by the same learn flow as MIDI
  (§5), saved with the song map. Phone: lanes are read and switched there, drawn on
  the desk. Waits on the sequencer's cue model; no default look changes.
- **34f. One-button share export.** *(S.)* §6's Render and Record make the file; the
  gap is a single "Save a clip with sound" on the desk and the phone that picks the
  container and size itself, with the small mark on the free site (§23). First the 3-minute
  1080p render in §6 has to be measured on a Mac. A portrait frame (9:16, for Reels and
  TikTok) beside landscape, as VS 2's recorder offers (§30, 2026-10-24): the plate
  rendered at that aspect, not a crop of the landscape frame.
- **34g. Legible reactions, named on the page.** *(S, copy.)* Kicks that stir the dye,
  a hit that seeds a bubble: these already exist in the sound patches (§28i-3). Name each
  look's reaction on its card in 34a and 34b ("kicks stir the ink") so a viewer sees that
  the picture is listening.
- **34h. A dropped picture or 3D model as a look.** *(L; check first.)* Photism's
  Limitless warps the user's own picture or a dragged-in 3D model with the music.
  `injectImage` pours a picture as dye, which is not the same. Find whether a picture
  source exists as a Mixer row (§11) before adding one; the logo-on-the-wall item in
  §23 would use it too. A 3D model is a later step, not part of the first piece.
- **34i. The DAW bridge, Syphon and NDI stay on the order they hold.** 13.7, 13.2 and 13.3
  are what a producer and a VJ pay for, and Photism has both. No change in scope, but
  13.7 is the one a music-maker audience (Home's buyers) asks for first: when the signed
  Mac app (13.1-sign) is out, take 13.7 before 13.3.

**Order.** 34a first (it needs no engine work and the site is the demo), then 34f and 34g
(small), then 34b and 34c; 34d, 34e and 34h are for when the planned VJ and DAW steps
have shipped. Not started.
