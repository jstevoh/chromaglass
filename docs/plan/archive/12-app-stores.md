# Archive: 12. ChromaGlass in the App Store and Google Play

The closed items of [`docs/plan/12-app-stores.md`](../12-app-stores.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- **12-ctl-1: the songs on the phone (shipped; story in `docs/plan-shipped.md` §12-ctl-1).**
  A Songs screen one tap from Draw and from Controls: the laptop's set list (tap to arm an item
  for the next Go) and its song shows (Run, Stop, Follow songs), sent as `RemoteState.setList`
  and `RemoteState.songs`; `npm run controller` lines `setlist`, `songs`, `display`.
- ~~**12-ctl-3**~~ *(shipped 2026-11-11)*: the Android app, a Capacitor project beside `ios/`; its story is in `docs/plan-shipped.md`.
**12-tv-1: the stream and the `/tv` page (shipped, PR 1 of route 2; story in
`docs/plan-shipped.md` §12-tv-1).** The show's page sends the wall's canvas to a
TV on the network as WebRTC video, signalled through the show server's relay
(`src/lib/tvFeed.ts`, `server/remote-server.js`'s `tv` role); `/tv?key=…` plays it
with no GPU (`src/components/TvDisplay.tsx`), films while the show is off; Home or
Pro on the laptop, three TVs at most; `npm run tv`.

What route 2 still needs, found while building 12-tv-1:

- **12-tv-remote: the TV's remote picks the look (shipped 2026-11-12; story in
  `docs/plan-shipped.md` §12-tv-remote).** Asked 2026-11-12, the TV staying a
  receiver: right and left play the next and previous preset on the Mac, OK a
  random one, up, down or Menu the list. The relay lets a TV pick only a preset
  the laptop listed, one every 0.4 s (`server/tv-remote.js`); the page reads the
  D-pad (`src/components/TvRemote.tsx`), the app passes on Menu and Back; the
  phone version is a tap bar. `npm run tvremote`; on a real TV `docs/judging.md` §126.
- ~~**12-tv-2h: the films through YouTube first, the splash, and the website's QR code.**~~
  (shipped 2026-11-15; story in `docs/plan-shipped.md` §12-tv-2h.)
- ~~**12-tv-2f: the samples are the channel's films; the logo on the loading screen.**~~
  (shipped 2026-11-14; story in `docs/plan-shipped.md` §12-tv-2f.)
**~~12-tv-signin~~: a TV signs in by a short code. Shipped (the licence Worker's
`/tv/` routes and the phone's `?tvlink` page); story in `docs/plan-shipped.md`
§12-tv-signin.** Open from it:
