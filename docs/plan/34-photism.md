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

- **34a. A landing page before the sign-in wall.** *Shipped (2026-10-22), first version*: `Landing.tsx` before the sign-in, `npm run signin` holding it; the owner's look is `docs/judging.md` §62. Story in `docs/plan-shipped/34-photism.md` §34a (moved 2026-10-29, 19m-2).
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
- **34a-4. Buy buttons, when the Lemon Squeezy webhook is set (23).** *(S.)* The page prints the
  prices and says "Buying opens soon". When 23's webhook issues a key from a test purchase, the
  tier cards get Buy buttons (`CHECKOUT_HOME_URL`, `CHECKOUT_PRO_URL` in `lib/tierGates.ts`) and
  the "opens soon" line goes. Until a test purchase has been made, no button.
- **34a-5. The owner's words and the share card.** *The words shipped (2026-10-28, the owner's OK
  on a line-by-line draft; story in `docs/plan-shipped/34-photism.md` §34a-5).* Open: `og-card.png` is still
  the old card; a new one would be the hero's frame with the name and the new headline. The maker
  note goes unsigned unless the owner says otherwise.
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
