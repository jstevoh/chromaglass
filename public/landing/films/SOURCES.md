# The music in the webpage's films

Each look on the webpage has a minute of film made to a piece of music (`src/lib/siteFilms.ts`,
`npm run sitefilms`, PLAN 34a-6). That minute is on the ChromaGlass channel and plays on the
webpage from there. The loops in this folder are cut from those films and have no sound. This
file records where each piece comes from and why we may use it. Add a piece here before you add
it to the list in the code.

Checked 2026-10-29. This is a record of what was checked, not legal advice.

## The licence they all rest on

Every piece is by Kevin MacLeod and comes from incompetech.com, under
**Creative Commons Attribution 4.0** (https://creativecommons.org/licenses/by/4.0/). That licence
lets us copy, adapt and share the work for any purpose, commercial use included, as long as it is
credited. The composer's FAQ (https://incompetech.com/music/royalty-free/faq.html, read
2026-10-29) answers "Can I use your music for YouTube videos?" with "Yes, AND you can monetize the
videos. Be sure to credit me." It also says that for video, the credit goes in the video's
description or in the video itself.

What we do with each piece: we cut a minute from it, fade its last three seconds, and play the
plate to it. Cutting and fading is an adaptation, and the licence allows it with credit. The
films' descriptions on the channel carry the credit in the composer's own words (his "Attribution
Code", below, which `npm run sitefilms` writes into each film's `youtube.txt`). The webpage's
player carries the credit under each film.

Each piece's file is fetched from the address below and checked against the checksum in
`siteFilms.ts`, so the piece that was filmed is the one recorded here.

## The pieces

| Look | Kind | Piece | ISRC | From | File |
|---|---|---|---|---|---|
| Ferro Paint | dark electronic | "Ethernight Club" | USUAN2100002 | 0:00 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Ethernight%20Club.mp3 |
| Aurora Borealis | ambient | "Dreams Become Real" | USUAN1500027 | 0:00 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Dreams%20Become%20Real.mp3 |
| Cell Bloom | chillwave | "Chill Wave" | USUAN1600048 | 0:00 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Chill%20Wave.mp3 |
| Poster, 1969 | classic rock | "Twisted" | USUAN1400046 | 0:00 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Twisted.mp3 |
| Macro Bead | jazz | "Space Jazz" | USUAN2100030 | 0:00 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Space%20Jazz.mp3 |
| Jellyfish Bloom | dub | "Dub Feral" | USUAN1200045 | 0:00 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Dub%20Feral.mp3 |
| Lacing Run | funk | "Funkorama" | USUAN1100474 | 0:08 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Funkorama.mp3 |
| Neon Coral Reef | 80s synth-pop | "Newer Wave" | USUAN2000024 | 0:00 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Newer%20Wave.mp3 |

## The credit, word for word

For each film, with the piece's title in place of *Title*:

```
"Title" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/
```

## Content ID

The composer's page on YouTube's Content ID
(https://incompetech.com/music/royalty-free/youtube-contentid.html, read 2026-10-29) says a claim
on one of his pieces almost always means the credit is missing, or is only in the picture where it
cannot be read automatically. So the credit goes in each film's description, in text, before the
film is published. If a claim still comes, dispute it through YouTube; he says it is released
within 72 hours. Each piece's ISRC (above, from incompetech.com's own list) is what to give if
someone else claims to own the recording.
