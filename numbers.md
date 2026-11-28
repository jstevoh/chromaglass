# The six looks re-tuned (PLAN 28i-8)

Rendered in the lab on the Mac's GPU (the real solver and plate shader, the synth band, a
sixtieth of a second a step), 960×600. `looks/<id>-before-<t>s.jpg` is main before the
change, `looks/<id>-after-<t>s.jpg` the branch `claude/project-thread-66wcb3`, at 30 and 60 s.

Numbers from the 480×300 lab run at 10 / 30 / 60 s. Y is mean luminance, clip the share of
the frame blown to white, dark the share near black, colourful Hasler–Süsstrunk.

| Look | Change | Before | After |
|---|---|---|---|
| Classical Vibe | comet's pull off, Turbulence 0.5 → 0.1 (Detail 3), Sound Drive 0.2 with bigger, more pours, Dye Budget 0.7, Layer Scale Variety 0.9, less blur and goo, bass → Buoyancy patch | colourful 57/57/57, Y .25, a bare haze | colourful 83/72/62, Y .14/.17/.22, mean dye .48/.32/.17, 0 dark, 0 clip |
| Mushy Mushy | Phase Scale 0.357 → 0.15 | dark .55/.38/.45, Y .11/.17/.14 | dark .45/.27/.23, Y .09/.15/.15 |
| Poster, 1969 | Lamp Ground 1 → 0.5, exposure 0.55 | clip .47/.20/.37 | clip .001/0/0, Y .30/.20/.25, 0 dark |
| Lava Lamp | bulb #ffc457 → #e3a347 (Oil Weight stays 0.5) | clip .64/.31/.26 | clip 0/0/0, Y .40/.32/.35 |
| Turing Print | Dye Budget 0.85 → 0.5, exposure 0.9 | Y .05/.05/.06, dark .50/.64/.65 | Y .28/.22/.20, dark .26/.46/.54, clip .01/.03/.05 |
| Lacing Run | Turbulence 0.7 → 0 | Y .17/.09/.09, colourful 113/82/74, a blurred blob | Y .10/.13/.09, colourful 89/97/81, a defined tongue; mean dye .06 at 60 s, still dim |

Lacing Run is only partly mended: the tongue keeps its edges, but the room's stir still
carries dye out over the open rim (PLAN 18a-25, filed by this change).
