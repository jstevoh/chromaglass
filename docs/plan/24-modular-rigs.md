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
  ~~*The melody walks across the plate (24.3-place, direction B of the owner's 2026-10-24
  exploration; after 25h).*~~ (shipped: each note the microphone hears lets go of one drop,
  low notes on one side of the plate and high on the other, a harder note a bigger drop; a
  `Melody Walk` dial, on Aurora Borealis and Oil & Water; `npm run melody`.) Story in
  `docs/plan-shipped.md` §24. Open, found building it:
  - **24.3-place-1. Only the microphone path, not MIDI.** The chord version (a note-on
    from a sequencer, spread across the plate by pitch, velocity as the drop's volume, a
    voice cap per channel) is still 24.3 proper; it should lay through `layMelodyDrop`
    and take its place from `melodyWalk.ts` (the same scale, the same line) so a played
    line looks alike whichever way it arrives.
  - **24.3-place-2. The notes the ear misses.** Under a kick on every beat and a snare on
    the backbeat, 10 of the scale's 15 notes were called (14 of 15 with no drums): the
    note onset (55 to 1000 Hz) is a rise against the band's recent loudness, and a note
    arriving in a kick's tail rises less (a kick 8 dB over the lead: on the note, 12 of 15; 30 ms after it, 13;
    30 ms BEFORE it, 1, its tail hiding the note's rise; the review of #537 found the case). Not fixed here; the walk is honest about it
    (a melody under a hard kick has gaps). A note onset read from the tonal (median-
    filtered) spectrum, which the kick has been taken out of, would hear them.
  - **24.3-place-3. A snare called on a lead's own attack.** The snare source fired at
    full strength on 8 of the 15 notes of the scale (a note above A3 has its third and
    fourth partners in 1 to 5 kHz), so the snare's onset is not a snare. The walk gets
    round it (a note beside a snare onset must have moved the pitch), but the beat
    clock's and 10.2-snare's snares are read from the same onset; 10.2-snare should
    test the harmonic-to-percussive balance before it believes one.
  - **24.3-place-4. Colour still follows the bin's class.** `pitchClass` (True
    Synesthesia, the music's colour) is read from a 43 Hz bin and so is off by up to two
    semitones at middle C; `pitchFine` is within a semitone from A3 up. Moving the
    colour to it changes every look's colours with sound, so it waits for the owner's
    say (a judging item) rather than going in with the melody.
  - **24.3-place-5. Two more looks, and a line you draw.** The two named looks have lines
    of their own; every other look takes a straight line across the middle if Melody
    Walk is turned up. Which looks next, and a way to drag the line on the desk (the
    way an area is placed), wait for the owner's eyes on these two (judging §94).
  - **24.3-place-6. `npm run shelf` is red on main, found while checking this.**
    It clicks a desk button whose text is "Sound" and finds none ("there is a
    Sound tab on the desk"), the same on an unmodified main at a68de68. It is
    not a manifest entry, so no PR sees it. Either the tab's label changed with
    the custom desk tabs (PLAN 8-tabs) and the check wants its new one, or the
    check should be a manifest entry once it reads the tab the way a hand does.
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
