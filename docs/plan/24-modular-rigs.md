# 24. Modular rigs: patch the rack into the liquid

*Asked 2026-10-04: how to sell ChromaGlass straight to modular (Eurorack) synth players,
and what would make it easy to bring into their shows. The owner put all four steps
below into the plan the same day.*

**Why not just the line-in.** Every visualizer has a line-in, and ChromaGlass's asks the
interface for one channel (`App.tsx`, `channelCount: 1`), so a stereo mix arrives folded
to mono. A modular player's sound is not one mix: the kick, the bass and the lead each
leave the rack on their own cable, and the rack runs on gates, control voltages and a
clock pulse rather than on MIDI. What makes a thing feel like it belongs in a rack is
that it can be patched. Many of these players already own a DC-coupled interface for
VCV Rack or Bitwig (Expert Sleepers ES-8: 4 DC-coupled inputs, 8 outputs, ±10 V,
class-compliant; ES-9: 14 in, 8 out; MOTU's UltraLite mk5 has DC-coupled outputs only),
so the interface is the dongle and needs no driver on a Mac.

**What already reaches them, with no new code.** MIDI clock, Start, Continue and Stop
into the beat clock, MIDI timecode, and MIDI learn from any CC or note (`midi.ts`), which
hardware sequencers (Hermod+, OXI One, Polyend Tracker, the Elektron boxes) drive, and so
do CV-to-MIDI modules (Befaco CV Thing, Expert Sleepers FH-2, Doepfer A-192-2). OSC
through the show server, which VCV Rack reaches with trowaSoft's cvOSCcv module (CV
sent as OSC, up to 32 more channels with its expanders) and monome norns speaks itself.
§13.4's OSC write-up should name both.

**The one fact that shapes the steps.** Chrome hands a page at most two input channels,
whatever the interface has, on macOS and on Windows: Chromium's
`AudioManagerMac::GetInputStreamParameters` keeps a device's channel count only when it
is two or fewer, the Windows code sets discrete input devices to two outright, and the
request to lift it (crbug 40403559) has been open since 2015. The Electron app inherits
the cap unless it reads the interface natively (inferred, not tested). With echo
cancellation, noise suppression and auto gain all off, Chrome skips its WebRTC
processing, where the high-pass filter lives, so DC on those two channels probably
survives; whether the OS or driver blocks it is unmeasured. So the site gets two
channels and the app all of them, which fits §23's rule that paid is what a page cannot
do. (§5's "an ear per input channel", 5-channels, says browsers "differ" above two: they
do not, Chrome stops at two. That item is now 24.1's audio half; its home is here.)

## Steps

- **24.1** *Patch inputs* (two PRs). A Patch panel lists the interface's input channels,
  each with a live scope, and makes each one of:
  - an **audio voice**: the channel is one instrument, and its onsets and level feed
    sound learn and the plate's sources by name (5-channels), so the kick channel drops
    and the bass channel swells with no guessing which band the kick is in;
  - a **gate**: a rising edge (with a threshold and hysteresis, so a slow envelope does
    not chatter) fires any action a pad fires;
  - a **CV**: a voltage rides any learnable setting as a MIDI fader does, over a chosen
    range (0–5 V, 0–10 V, ±5 V) and the setting's own curve, smoothed by a frame;
  - a **clock** at 1, 2, 4, 24 or 48 pulses a beat into the beat clock as a tempo
    source beside MIDI clock and tap, and a **reset** that is bar one: the downbeat a
    MIDI clock never carries.
  Learned as MIDI is: touch the cable, and the channel that moves is the one picked.
  Saved with the show and in the MIDI map file. Volts are read off the interface's
  full scale (the ES-8 and ES-9 are ±10 V at full scale), with a calibrate step that
  reads 0 V and a known voltage for any other interface. The phone's remote shows the
  Patch page read-only (what each cable does, live); editing is on the laptop.
  - **24.1a** (lanes D and B, after 1.5): two channels, on the site and in the app,
    through `getUserMedia` with `channelCount: 2` and a `ChannelSplitter`.
  - **24.1b** (`desktop/`, after 24.1a and 13.1-sign): every channel in the Mac app,
    read natively (Core Audio through a small native module) and handed to the page
    as the same sources. Paid (§23). The Windows app's with 13-win-app.
  *Measure:* a new check, `patch`, that feeds a page a generated multichannel WAV as its
  fake capture device: channel 1 a gate at 120 bpm, channel 2 a slow DC ramp, channel
  3 a 4-pulses-a-beat clock with a reset every 16 beats. Every gate fires its action
  within one frame (count equal, none doubled), the ridden setting tracks the ramp
  within 2 % of its travel, the clock reads 120 bpm, and the bar grid's one lands on
  every reset. In the app, the same with all channels. By hand on the Mac with an ES-8
  (docs/judging.md, next free number at merge): DC on the site's two channels, measured.
- **24.2** *The interface picked at soundcheck is the one the show hears, and comes back
  after a knocked cable.* This is Wave 1's 1.5 (14s) and 1.6 (14g); a rack is plugged
  in at soundcheck and knocked at the gig, so 24.1 is not offered before both ship.
- **24.3** *MIDI notes as voices* (lane D then B, one PR). A sequencer's notes play the
  plate rather than press a button: a channel picks the tool and the liquid, pitch the
  dye (or a place on the plate, by a scale across it), velocity the drop's size, and a
  held note pours for as long as it is held. It is a binding kind beside `setting`,
  `action`, `preset` and `dye` in `MidiTarget`, learned from the first note that
  arrives, so one learn covers every note on that channel. Start as bar one is 14e's
  (Start and dropout) and 5-downbeat's; 24.3 does not do it twice. *Measure:* beside
  `npm run desk`'s MIDI lines, a page fed a recorded sequence of notes on two
  channels: one drop per note-on, the dye by pitch, the size rising with velocity, and
  a held note's pour lasting its length within a frame.
  *Moved up and widened (§30, 2026-10-11).* Sequencer apps in an iPad host (AUM, Loopy
  Pro, Drambo) send notes rather than CCs, and Imaginando's VS is played by notes firing
  envelopes. Two additions: each channel's pour gets an attack and a release, so a note
  can swell in and fade out rather than start and stop; and notes become a patch-bay
  source (`notes`: velocity, pitch, held, per channel), so a note can ride any setting
  the way a band does. The measure adds a held note whose pour rises over its attack
  and falls over its release, each within 10% of its time.
  *Chords placed (VS 2, 2026-10-24).* VS plays four voices a layer, held notes stacking
  into a chord with each voice somewhere else on screen. Here a chord lands as several
  drops at once, spread across the plate by pitch (a scale across it, as above), each a
  real pipette drop whose volume is its velocity, meeting the others by the liquids' own
  immiscibility. Each channel has a voice cap (four by default; the oldest held note gives
  way) so a pad held on ten fingers does not flood the plate, and a channel can be sent to
  an area (25h). The measure adds a three-note chord: three drops in one frame, ordered
  across the plate by pitch, and a fifth held note releasing the first.
  *The melody walks across the plate (24.3-place, direction B of the owner's 2026-10-24
  exploration; after 25h).* The same scale across the plate, heard from the microphone as
  well as MIDI: the lead note's pitch (the `note` source, a fast reading) places its drop,
  low on one side and high on the other, so a played line draws across the plate; how hard
  it was hit sets the drop's volume. Each is a real pipette drop of the look's liquid, so
  neighbours merge or hold apart by immiscibility. First on **Aurora Borealis** (lead notes
  drop jade and lavender along the curtain's top and the current draws each run into a
  ribbon) and **Oil and Water** (each note a bead of amber oil, a chord a cluster that
  rounds into bodies and merges where they touch). *Measure:* a synthetic rising scale on
  the microphone path lands its drops in pitch order across the plate, one drop per note.
- **24.4** *CV out* (after 24.1b). The plate back into the rack through the interface's
  DC-coupled outputs: how much dye is moving, where the brightest pool sits on the plate
  (x and y), the colour under a point, and a trigger when a drop lands. Then the liquid
  modulates the synth and the loop is the show, which no comparable video module does
  that way round. Read on the GPU from the readouts the governor and the flash guard
  already take (no new full-plate readback), sent a frame at a time and smoothed at
  audio rate so a step does not click. The site may reach the first two outputs
  (`AudioContext.setSinkId`, Chrome 110 and later, then a `ChannelMerger`); the app
  reaches all of them. *Measure:* a page whose output is captured back as a WAV: the
  dye-motion output rises within a frame of a stir and falls when the plate rests, and
  the drop trigger counts the drops.

**Later, not a step yet.** No laptop: an iPad with a class-compliant interface (the ES-8
is class-compliant on iOS) and HDMI out through Apple's USB-C Digital AV Multiport
Adapter, which carries HDMI and a USB device together; the two working at once on one
iPad is unverified. It rides on §12's app, not a box of our own. A Eurorack module of
our own is not planned (hardware, stock, a different business).

**Reaching them** (with 23.7's free beta). A one-minute patch video (a kick's gate into
the interface drops on every hit, an LFO makes the colour breathe, a clock and reset
change the look on the bar) posted to ModWiggler's Video Synthesis forum, lines
(llllllll.co), r/modular and r/videosynthesis, and sent to the creators who already
review video synths. Ask Expert Sleepers to list ChromaGlass as working with the ES-8
and ES-9. Superbooth 27 is 6–8 May 2027 in Berlin. The dedicated video synths cost
$400–1,500 (EYESY, Hypno, Structure, Videomancer), which is the price to sit under.
