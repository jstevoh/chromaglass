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
light show,liquid,psychedelic,visualizer,music,oil,ferrofluid,VJ,projector,lava,fluid,trippy
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
