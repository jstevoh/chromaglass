# Archive: 14. The show at the gig: hearing, timing, speed and the picture on the wall (continued)

The closed items of [`docs/plan/14-show-at-the-gig-2.md`](../14-show-at-the-gig-2.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
## 14w. The pointer on the wall (shipped)

**Shipped.** Story in `docs/plan-shipped.md` §14w (moved 2026-10-29, 19m).

## 14x. The microphone hears the hand on the laptop (shipped)

**Partly shipped** (2026-10-04): a reading taken just after a press, key or touch on the page calls no onset on the microphone (`npm run clicks`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Still open:*
- *A gesture the page handles after its sound has reached the ear is not gated.* The
  browser hands input over at the start of a frame and the ear reads after it, so with
  a laptop's ~30 ms of input latency a frame's delay is covered (`npm run clicks`
  measures it); a page busy for longer than the latency, or a microphone faster than
  the trackpad, lets that click through. Holding every onset back to wait for late
  events would make every kick late; not done.
- *A line input is gated too.* An audio interface on the "microphone" source does not
  hear the trackpad, but its kicks in a gesture's moment are swallowed all the same (at
  most one a gesture; the clock covers a steady song). If it matters at a gig, a switch
  on the Sound panel, or the device's label, could say which input is a room.
- *Judged on a real laptop.* The click modelled in `npm run clicks` is a tick and a
  thump; a MacBook's own microphone on its own trackpad is the owner's to try: pick
  tools and ride Speed in a quiet room on the microphone, and the plate should not
  move on the clicks.

## 14y. The sound Source opens on Off (shipped, asked 2026-10-22)

**Shipped.** Story in `docs/plan-shipped.md` §14y (moved 2026-10-29, 19m).

- **Measured** (`npm run opensource`) and **check changes** (`qa`'s first-visit line, `kickbubbles`, and the harnesses that set the remembered source). Story in `docs/plan-shipped.md` §14y (moved 2026-10-29, 19m-2).
- **Judged by the owner:** a landing visitor no longer meets a plate moving to music
  before choosing anything (14y reverses that first-visit choice at the owner's word); if
  the landing page (34a) wants a moving demo it should be a filmed clip, not the live band.
- ~~**14y-2** The Mac app keeps System audio across a relaunch or an update.~~ **Shipped**
  2026-11-10 (the owner: "I shouldn't have to click the system audio ever"). Only System audio,
  only in the Mac app; every other source still opens on Off. `npm run opensource` (3 new lines).
  Story in `docs/plan-shipped.md` §14y-2. The owner was asked on a card whether every source
  should be kept instead; the default (System audio only) shipped while that waits.

## 14aa. The plate stutters in bursts on a machine with room to spare (shipped, asked 2026-10-24)

**Shipped.** Story in `docs/plan-shipped.md` §14aa (moved 2026-10-29, 19m).

- ~~**14aa-2**~~ (measured 2026-10-25 on the owner's Mac, Metal, comment on #441) Shipped;
  story in `docs/plan-shipped.md` §14aa-2 (moved 2026-10-29, 19m).

## 14aa-3. The governor climbs back to sixty steps into a stutter (shipped 2026-10-25)

**Shipped**: the governor measures what a solver step costs apart from the frame's drawing,
judges each climb on what the state it climbs to would cost, and gives sixty steps up when
frames keep missing a refresh with the GPU over its budget, where it used to wait for an
average that sat either … Story in `docs/plan-shipped.md` §14aa-3 (moved 2026-10-29, 19m).

Open, found doing it:

## 14ab. What else runs on the CPU every frame (found with 14aa, read in the code)

- ~~**14ab-1** *The video pour pauses and plays its video every frame* (a bug).~~ Story in
  `docs/plan-shipped.md` §14ab-1 (moved 2026-10-29, 19m).
- ~~**14ab-2** *The video pour's optical flow is a CPU loop*~~ **Shipped** (#584, `npm run videoflow`: no loop and no rows sent while a video pours, the deltas the CPU loop's to 1.7e-7). Story in `docs/plan-shipped.md` §14ab-2.
- ~~**14ab-3** *Every frame reads both fields back and averages them on the CPU*~~ **Shipped** (#549, `npm run framereads`: a still plate 60 → 0 readbacks asked in thirty frames). Story in `docs/plan-shipped.md` §14ab-3.
- ~~**14ab-4** *A CPU pour uploads the whole grid every step*~~ **Shipped** (#579, `npm run frameuploads`: a cell after a cell 1.33 MB → 14 KB, the flush 318 → 18 µs). Story in `docs/plan-shipped.md` §14ab-4.
- ~~**14ab-5** *The plate, post chain, camera, output and particles make their bind groups and views every frame*~~ **Shipped** (#549, `npm run framegroups`: 12 groups and 64 views a frame → 0 and 0). Story in `docs/plan-shipped.md` §14ab-5.
- ~~**14ab-6** *The beads redraw a 512² canvas and upload it every frame they move*~~ **Shipped** (`npm run beadmask`: the drops' mask rasterDrops' to a level, the frame's CPU 16–19 ms → 0.4–0.6 ms, 2.1 MB → 95 KB across). Story in `docs/plan-shipped.md` §14ab-6.
- ~~**14ab-15** *The beads' passes are not timed on the GPU.*~~ **Measured** 2026-10-30 on the
  owner's Mac (Apple M4, Metal), `scratch/beadbench.mjs` (not kept: the same field a frame, the
  old way and the new, each waited out with `onSubmittedWorkDone`, 200 frames, twice): drops 16.5
  ms → 1.6 ms a frame (closeup sizes 23.0 → 1.6), rings 3.0 → 0.6; the `bead mask` pass alone by
  timestamp query 0.50 ms for 502 drops (0.57 at closeup sizes), 0.11 ms for rings. No bar in CI:
  the Mac shards' runners are not the owner's GPU, and the lab shard's is software.
- ~~**14ab-7** *The ear allocates every frame*: two byte arrays (14f's open line), two
  `Float64Array`s, and seventeen onset detectors each doing slice, sort, map and sort on
  their history.~~ Shipped; story in `docs/plan-shipped.md` §14ab-7 (moved 2026-10-29, 19m).
- ~~**14ab-8** *The gamepad* re-renders App at 30 Hz while its cursor shows~~ **Shipped** (#533, `npm run renders`' gamepad phase). Story in `docs/plan-shipped.md` §14ab-8 (moved 2026-10-29, 19m-2).
- ~~**14ab-9** *Thick liquid's share* makes a MAP_READ buffer and two 590 KB arrays every sixty steps~~ **Shipped** (#549, `npm run framereads`: the same share to the bit, no buffer after the first). Story in `docs/plan-shipped.md` §14ab-9.
- ~~**14ab-13** *Is a poured video upside down?*~~ **Shipped** (#591, finished in #596): it was, and an uploaded picture too; both turned where their rows are taken (`flipY` in the solver's copy, the loop's row read, `uprightPicture` for an upload), `npm run videoflow` asks which way up. Story in `docs/plan-shipped.md` §14ab-13.
- ~~**14ab-16** *The GPU liquids' forces ran only on a step that flushed.*~~ **Shipped** as
  15e-1, the standing item it turned out to be: the liquids act in the solver's own step
  (`stepLiquids`), behind `liquidsLive`. Story in `docs/plan-shipped.md`, "15e-1 (met again
  as 14ab-16) and 46r".

## 14ae. One Record button (shipped, asked 2026-10-24)

**Shipped.** Story in `docs/plan-shipped.md` §14ae (moved 2026-10-29, 19m).
