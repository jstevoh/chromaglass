# The test set: four clips with known answers

Before trusting the routine on someone's footage, watch these with the skill and hold your
account to the key below. Each clip has one thing a careless read gets wrong. The numbers
quoted are what reelreader measured on them (ffmpeg 6.1, Linux); another ffmpeg moves them a
little, not across a line the key draws.

| Clip | What it is | Run with | The trap |
|---|---|---|---|
| `general-film.mp4` | 22 s of an animated short, seven cuts | nothing | the content read: say what is in it |
| `good-take.mp4` | 16 s of a liquid light show in a round dish | nothing | grading by the card instead of the frames |
| `frozen-take.mp4` | the same take, frozen from 5 s to 10 s | `--liquid` | the summary calls it "one steady pace" |
| `turned-take.mp4` | the same take, the whole picture turning once every 8 s | `--liquid` | the summary calls it fast, churning flow |
| real show (linked, not shipped) | one minute of a 1969 liquid light show film | nothing, then `--liquid` | it reads general |

The two bad takes are liquid footage with a fault, and a fault can knock out a cue the tool
uses to tell liquid footage (a freeze has no motion of its own; a drained take has no light):
always pass `--liquid` for a take you know is a liquid show. Here both still read liquid by
themselves; the flag is in the key so the set keeps its answers if a cue moves.

A script holds the measured half of this key ([answers.json](answers.json)): each clip's
read, its cuts, its freezes and its turning.

## The key

### general-film.mp4: lens, editor

**Must say.** Read as general footage (19 hard cuts a minute, 2% near black). Seven cuts, at
0:00.7, 0:03.8, 0:09.5, 0:11.3, 0:13.5, 0:15.6 and 0:20.0: eight shots, about 2.8 s on
average, the longest 5.7 s (0:03.8 to 0:09.5). The content, from the sheets: a large white
rabbit in a sunny meadow. (1) A low-angle shot of the rabbit stretching. (2) A medium close
shot of its face. (3) A wide shot through white flowers in the foreground, the rabbit by a
tree, walking toward the camera until it fills the frame and sniffs a flower. (4) A wide shot
of it from behind on the grass. (5) A high shot over a brown animal's shoulder in a tree,
looking down at the rabbit. (6) A close shot through flowers again. (7) An overhead shot of
the rabbit lying on the grass with a pink butterfly. (8) A wide shot of it standing, watching
the butterfly. Animated,
daylight, greens and sky blue (green 41%, blue 37% of the colour), soft edges. No audio
track, so nothing about sound.

**Must not say.** Anything from a physics read or a report card (it has none, rightly). A
named character or film title as if read from the footage (the frames do not show one; say
"an animated short"). Dialogue or music.

### good-take.mp4: lens, VJ or liquid light artist

**Must say.** Read as liquid by itself: one take, its own motion (the whole field 20%), a
dark ground (46% near black) and highly colourful light (colourfulness 109). A round dish on
black; red and violet dye bodies against each other, parted by dark seams, with a few bright
pink beads drifting and small dark rings (bubbles). Its own flow 3.0% of the width a second,
inside the range real shows read (2.0 to 8.0); carried about 0.26, a little over real shows'
0.13 to 0.23 (a software take, carrying more of its change than a filmed show). One steady pace, no swell in 16 s (one take: may vary). No audio, so nothing about the
beat. A small bright ring with a dot appears top right at about 0:06.9 to 0:07.6: a pointer
or tool mark over the picture, not part of the liquid. No fault. The Footage section masks
four regions as "still overlays" (one a strip down the left quarter of the frame) and drops
three 0.4 s "title spans": the sheets show no overlay and no title, so say the Footage read
misfired on the slow, dark parts of the dish, and that the masked regions were left out.

**Must not say.** That the card's "Strongest on Intensity (8.0)" makes it good: the card
gives the frozen take the same verdict.

### frozen-take.mp4: lens, VJ (and video QA)

**Must say.** The picture stops dead from about 0:04.7 to 0:10.3 (the motion strip is flat
and the timeline's streaks run straight across), then moves again: a freeze of about 5.6 s,
the fault an audience sees first. The Footage section does see it, misnamed: it drops
0:04.8 to 0:10.2 as a "title span", which is why the motion reads and the Overall never meet
it. Everything else as the good take.

**Must not say.** "One steady pace from start to end" (the summary's Overall says it), or
that the card's marks mean the take is fine: its verdict is the good take's word for word, and
every canon is within 0.6 of the good take's.

### turned-take.mp4: lens, VJ (and video QA)

**Must say.** The whole picture inside the rim turns as one body, clockwise, once every 8 s
(45° a second): from one sheet frame to the next the same shapes sit at a new angle round
the centre, unchanged. That is a whole-frame turn, not the liquid flowing. The tool's flow
number (about 17% of the width a second, "fast, churning", over every real show) and its
rotation line (curl 0.56/s, "about one turn in 22 s") are this turn misread as flow; the true
period is 8 s, read off the sheets.

**Must not say.** That the liquid churns fast or that the flow is far over real shows.

### The real show (linked, not shipped)

Joshua Light Show, *Liquid Loops* (1969), Internet Archive item `JLSLIQUIDLOOPS1969Copy`,
2:00 to 3:00. Its rights are not stated, so it is not in this folder: fetch the minute
yourself (`ffmpeg -ss 120 -i <the item's mp4> -t 60 -c copy jls.mp4`), and keep it private.

**Must say.** Read as general (3 hard cuts a minute, with 2 dissolves: the film's splices
and superimposed loops), though the frames show oils and dyes projected: a liquid light
show. Run it again with `--liquid` and say why. Then its carried share sits inside real
shows' range (about 0.21), because it is one.

**Must not say.** That it is not a liquid show because the tool read it general.

## Where the clips came from

- `general-film.mp4`: *Big Buck Bunny* (2008), © Blender Foundation, peach.blender.org,
  licensed CC BY 3.0. Excerpt 1:00 to 1:22, scaled to 480 wide, sound removed.
- `good-take.mp4`: a software liquid light show (a fluid simulation drawn as a projected
  dish), recorded from its own Record button, scaled to 480 wide. Shared under this tool's
  licence.
- `frozen-take.mp4` and `turned-take.mp4`: made from the same recording with ffmpeg, so their
  faults are exact. Make your own from a good take of yours the same way:

```sh
# a freeze: 0-5 s, then the frame at 5 s held for 5 s, then 5-11 s
ffmpeg -i take.mp4 -filter_complex "[0:v]trim=0:5,setpts=PTS-STARTPTS[a];[0:v]trim=start=5,setpts=PTS-STARTPTS,trim=0:0.05,loop=loop=-1:size=1,trim=0:5,setpts=N/FRAME_RATE/TB[b];[0:v]trim=5:11,setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1,scale=480:-2,fps=30[o]" -map "[o]" -an frozen-take.mp4
# a whole-frame turn: the picture rotated clockwise once every 8 s, inside a fixed round rim
ffmpeg -i take.mp4 -vf "scale=480:-2,fps=30,rotate=2*PI*t/8:fillcolor=black,format=yuv444p,geq=lum='if(gt(hypot(X-240,Y-150),148),0,lum(X,Y))':cb='if(gt(hypot(X-240,Y-150),148),128,cb(X,Y))':cr='if(gt(hypot(X-240,Y-150),148),128,cr(X,Y))'" -an turned-take.mp4
```

All four are H.264, no sound, 0.5 to 0.8 MB each.
