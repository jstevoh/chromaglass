# The store listings

PLAN.md §12, step 6 (12.6). What the App Store and Google Play ask for, written
ahead of the apps so that 12-ship and the Play shell are a matter of pasting,
not writing. Both apps are free with nothing to buy (the 2026-10-30 decision),
so no listing names a price, a tier or a way to buy, and the iPhone listing
names no laptop-only feature as its own: in WKWebView there is no Web MIDI, no
capture of other apps' sound and no projector window, so the iPhone app is a
pocket plate and a laptop's remote (§12, "The decision"). The Android app is
the website in Chrome and has all of it, but its listing says only what both
phones do, so the two never disagree about the same show.

Each field below is a heading with the store's limit in characters, and the
text in the block under it. `npm run presskit` holds every block to its limit and
fails an empty one, so a field cannot be pasted into a store that would cut it.
When the app's features or the privacy page change, these change with them.

The pictures:

| Store | Asks for | Where it is |
|---|---|---|
| App Store | 1024 × 1024 icon, opaque, full bleed | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (`npm run brand`) |
| App Store | 6.9" iPhone screenshots, 1320 × 2868 portrait | Owed: from TestFlight on the owner's phone (step 7), since the plate in a screenshot must be the phone's own GPU (12.6-shots) |
| Google Play | 512 × 512 icon | `docs/brand/store/play-icon-512.png` (`npm run brand`) |
| Google Play | 1024 × 500 feature graphic | `docs/brand/store/play-feature-1024x500.png` (`npm run brand`) |
| Google Play | 2–8 phone screenshots | Owed with the closed test (12.6-shots) |

The privacy policy URL for both is `https://chromaglass.art/privacy.html`; it
has a section for the phone apps. Support: `support@chromaglass.art`. The
press page (`/press`) has the stills a listing's preview video could be cut from.

## App Store

### App Store: Name (30)

```text
ChromaGlass
```

### App Store: Subtitle (30)

```text
Liquid light show to music
```

### App Store: Promotional text (170)

```text
Oil, ink and ferrofluid on a glass plate, simulated drop by drop and moving to the music in the room. Pour, push and blow the colour with your fingers.
```

### App Store: Description (4000)

```text
ChromaGlass is a liquid light show in your pocket: the 1960s overhead-projector show of oil, ink and water, simulated drop by drop on your phone's graphics chip.

Pour colour onto the glass and play it with your fingers. Push it, swirl it, drop oil into it and blow it apart. Every drop is a real fluid simulation, so oil stays oil, ink spreads and bleeds, and ferrofluid stands up in spikes under a magnet.

Put music on and the plate listens. Through the microphone, the kick, the bass and the hats move the liquid, so the colour breathes with the song in the room.

- More than thirty looks, from 1969 concert posters to coral, cells and aurora
- Oil, dye, ferrofluid and soap film, each with its own physics
- Tools to pour, stir, blow and press the glass
- Reacts to the music around you through the microphone
- Plays offline: the whole show is inside the app
- Doubles as the remote for ChromaGlass on a laptop, over your own Wi-Fi

The show can flash with the music. A flash guard, on by default, keeps it under three flashes a second.

Free, with nothing to buy and no ads.
```

### App Store: Keywords (100)

```text
light show,liquid,psychedelic,visualizer,music,oil,ferrofluid,VJ,ambient,lava,fluid,trippy
```

### App Store: What's New (4000)

```text
The first version of ChromaGlass for iPhone and iPad.
```

### App Store: Review notes (4000)

```text
ChromaGlass is a real-time fluid simulation drawn with WebGPU, bundled inside the app, so it runs offline and is not a website in a wrapper. To try it: open the app, touch and drag on the plate to pour and push colour, and play music near the phone to see the plate answer the microphone. The More menu has Laptop remote, which pairs the app with ChromaGlass running on a computer on the same Wi-Fi; that needs a computer and is not required to review the app. The app contains no purchases and no links to buy anything. The microphone, camera, motion and Photos permissions are each asked for only when the feature that needs them is first used.
```

Category: Entertainment (primary), Music (secondary). Age rating: 4+, with
"Frequent/Intense" not selected for any item; the flashing is covered in the
description and by the flash guard (`src/lib/flashGuard.ts`).

App Privacy label (the same flows as `public/privacy.html`; re-read both
before submitting, and change the label if the page changed):

| Data | Collected | Linked to the person | Used for | Tracking |
|---|---|---|---|---|
| Diagnostics: crash data | Only when the person presses Send on the report sheet | No | App functionality | No |
| Audio data | A four-second clip, only when song identification is on, sent to AudD or ACRCloud and not kept by us | No | App functionality | No |
| Contact info: email address; Identifiers: user ID | Only if the app shows sign-in (decided in 12-ship) | Yes | App functionality | No |
| User content: other (feedback notes) | Only when the person presses Send in Feedback | Yes if signed in, else No | App functionality | No |

## Google Play

### Google Play: App name (30)

```text
ChromaGlass: Liquid Light Show
```

### Google Play: Short description (80)

```text
Oil, ink and ferrofluid on glass, simulated drop by drop and moving to music.
```

### Google Play: Full description (4000)

```text
ChromaGlass is a liquid light show: the 1960s overhead-projector show of oil, ink and water, simulated drop by drop on your phone's graphics chip.

Pour colour onto the glass and play it with your fingers. Push it, swirl it, drop oil into it and blow it apart. Every drop is a real fluid simulation, so oil stays oil, ink spreads and bleeds, and ferrofluid stands up in spikes under a magnet.

Put music on and the plate listens. Through the microphone, the kick, the bass and the hats move the liquid, so the colour breathes with the song in the room.

- More than thirty looks, from 1969 concert posters to coral, cells and aurora
- Oil, dye, ferrofluid and soap film, each with its own physics
- Tools to pour, stir, blow and press the glass
- Reacts to the music around you through the microphone
- USB MIDI controllers work on phones and tablets that support them

The show can flash with the music. A flash guard, on by default, keeps it under three flashes a second.

Free, with nothing to buy and no ads. Needs a phone with WebGPU in Chrome (Android 12 or later on most recent phones).
```

Category: Music & Audio. Content rating (IARC): no violence, no sexual
content, no gambling, no user-to-user chat; the questionnaire's answers give
Everyone / PEGI 3.

Data safety (the same flows as the App Store label): data is encrypted in
transit; the person can ask for deletion (Delete account, or
support@chromaglass.art); collected, all optional and none shared for
advertising: crash logs (when sent), audio (song identification, when on),
email address and user ID (sign-in), other user-generated content (feedback,
when sent). No data is sold, and no advertising ID is used.

## Google Play: the Android TV app

PLAN 12-tv-2b. A separate Play app (`app.chromaglass.tv`, `androidtv/`) with
its own listing, because a TV app and a phone app are different packages. It
draws nothing itself: it finds the Mac running the show on the same Wi-Fi and
plays the plate the Mac sends it (12-tv-1, 12-tv-2). With no Mac it plays a
sample film (the press clips), which is what Play's TV review, done on a real
TV with no Mac, will see. Its listing names no price and no tier either; it
says plainly that it needs the Mac app, since a TV owner without one would get
nothing from it but the sample.

The pictures (`npm run brand`):

| Asks for | Where it is |
|---|---|
| 512 × 512 icon | `docs/brand/store/play-icon-512.png` (the phone listing's) |
| 1024 × 500 feature graphic | `docs/brand/store/play-feature-1024x500.png` (the phone listing's) |
| 1280 × 720 TV banner | `docs/brand/store/play-tv-banner-1280x720.png` |
| TV screenshots, 16:9, at least 1 | `docs/brand/store/tv/` (six, 1920 × 1080 JPEG: the plate the TV shows, from the app's own Song films) |

### Google Play TV: App name (30)

```text
ChromaGlass TV
```

### Google Play TV: Short description (80)

```text
The liquid light show from ChromaGlass on your Mac, played on your big screen.
```

### Google Play TV: Full description (4000)

```text
ChromaGlass is a liquid light show: the 1960s overhead-projector show of oil, ink and water, simulated drop by drop and moving to the music. ChromaGlass TV puts that show on the biggest screen in the house.

The show runs in the ChromaGlass app on your Mac. Start it, open ChromaGlass TV on the same Wi-Fi, and the TV finds the Mac by itself. The first time, the TV shows four digits and the Mac asks whether to let it in: press Allow, and the plate is on the TV a moment later. After that it opens straight to the show.

- Finds the Mac on your network by itself, with nothing to type on a remote
- Pairs once with four digits, and remembers the Mac
- Plays whatever the Mac plays: every look, the music's pulse, your pours
- Up to three TVs at once, from one Mac
- Watch a sample film any time, with or without a Mac

The show can flash with the music. A flash guard, on by default in the Mac app, keeps it under three flashes a second.

Needs the ChromaGlass app on a Mac on the same Wi-Fi, with a plan that includes TV at home. The TV draws nothing itself, so it works on every Android TV and Google TV, old or new.
```

Category: Music & Audio (the same as the phone app). Content rating (IARC):
the questionnaire's category "All Other App Types", every answer No: Everyone /
PEGI 3.

Data safety: **no data collected, no data shared.** The app sends nothing
about the person anywhere. The plate comes over the home network from the
person's own Mac; the key the Mac hands the TV is kept on the TV; the sample
film is a plain download of a public file from the website, with no account,
identifier or analytics. No ads, no advertising ID, no sign-in.

App access (Play Console → App content → App access), for the reviewer:

```text
ChromaGlass TV plays a show that runs in the ChromaGlass app on a Mac on the same Wi-Fi network; the TV draws nothing itself. Without a Mac, choose "Watch a sample film" on the first screen: it plays two 20-second films of the same liquid light show the Mac sends (press Back to return). With a Mac: open ChromaGlass on the Mac and start the show; the TV finds it within a few seconds and shows four digits; press Allow on the Mac and the show plays on the TV. No account or sign-in is needed on the TV.
```

## App Store: the Apple TV app

PLAN 12-tv-apple-7. Its own App Store record, "ChromaGlass TV" (`app.chromaglass.tv`,
`tvos/`). It plays the plate the Mac app sends over the home network, like the
Android TV app, but it is signed in differently: the TV shows a short code that a
Home or Pro account claims on a phone (12-tv-signin), and then the person types the
Mac's TV address (finding the Mac by Bonjour is 12-tv-apple-1). Guideline 3.1.3(f),
free stand-alone companion: the app opens only what was bought on the website, and
it names no price, has no buy button and links to no purchase page. The code screen
says "Needs a Home or Pro licence." and nothing more about plans.

Screenshots: `docs/brand/store/tv/` (the same six 1920 × 1080 JPEGs as Play's).
Support URL `https://chromaglass.art/pro.html`, privacy policy URL
`https://chromaglass.art/privacy.html` (its "Apple TV" item). Category:
Entertainment, Music second, as the phone app. Age rating 4+, every item None.
App Privacy: the linked-TV record (email address, linked to the person, for app
functionality, no tracking), the same as the website's account.

### App Store TV: Subtitle (30)

```text
Liquid light show on your TV
```

### App Store TV: Promotional text (170)

```text
The 1960s liquid light show of oil, ink and water, simulated drop by drop on your Mac and played on the biggest screen in the house.
```

### App Store TV: Description (4000)

```text
ChromaGlass is a liquid light show: the 1960s overhead-projector show of oil, ink and water, simulated drop by drop and moving to the music. ChromaGlass TV puts that show on the biggest screen in the house.

The show runs in the ChromaGlass app on your Mac. ChromaGlass TV receives it over your home Wi-Fi and plays it full screen, so the TV draws nothing itself and every look, every pour and the music's pulse arrive as they happen.

- Link the TV once with a short code, entered on your phone
- Plays whatever the Mac plays: every look, the music's pulse, your pours
- The picture comes straight from your Mac over your own network
- Nothing to buy in the app

The show can flash with the music. A flash guard, on by default in the Mac app, keeps it under three flashes a second.

Needs the ChromaGlass app on a Mac on the same Wi-Fi, and a ChromaGlass account with a Home or Pro licence.
```

### App Store TV: Keywords (100)

```text
light show,liquid,psychedelic,visualizer,music,oil,projector,ambient,VJ,lava,1960s
```

### App Store TV: Review notes (4000)

Not final: the reviewer has no Mac and no licence, so before submitting, the app
needs a way to show the plate without them (12-tv-apple-9) and these notes a demo
account.

```text
ChromaGlass TV is a free companion to the ChromaGlass app for Mac. It plays, over the home network, the liquid light show the Mac app renders; the TV draws nothing itself. Under guideline 3.1.3(f) it opens only what the person bought on our website: the app shows no price, has no buy button and links to no purchase. The TV links to an account by a short code entered on a phone (chromaglass.art/?tvlink), and then plays the show from the Mac whose address it is given. The app never uses the camera or the microphone; the purpose strings are present only because the WebRTC library it uses links those APIs.
```
