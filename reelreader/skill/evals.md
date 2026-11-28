# Build your own eval set

The test set says whether the routine works on four clips someone else chose. Whether its
verdicts mean anything for *your* footage is a different question, and only your own ratings
can answer it. This page is how to walk a person through making that eval set, and when its
answers let a verdict be trusted.

## Why it matters

The report card's bands were set on two real liquid light shows. On anything else, a canon's
score is a distance from those two films, not a measure of what this person likes. The tool
prints how far its scores agree with a person's own ratings (Spearman's rank correlation, per
canon); until that agreement is there, report the measures and leave the verdicts out.

## 1. Pick the clips (with the person)

- **10 to 20 clips** of the kind they judge: their own takes, references they admire, and
  some they dislike. A set of only good clips cannot show that a score tells good from bad.
- **Spread them**: calm and busy, dark and bright, short and long, early and recent work.
- **Put known faults in**: a frozen take, a drained one, one with a seam or a halo, a whole
  picture that turns. The test set's ffmpeg lines make a freeze and a turn from any good take.
- **Keep three or four aside**: rate them like the rest and tick "keep aside" on the rating
  page. A refit never fits on them, so they are the check that agreement was not fitted to the
  clips it was measured on.
- Same window length for each (30 to 60 s), same frame count, and crop each to the picture
  if the camera shows a room.

## 2. Watch them as a batch and rate them

Put the clips in one folder (or a playlist, or a text file with one path or link a line) and
run `reelreader --batch <folder> --out <dir>`. Every clip is watched as a single run would
watch it, into its own folder, and the batch writes a ranked table (`batch.md`, `index.html`)
and a **rating page**, `rate.html`: one file, no server and no account, that plays each clip
above its timeline and contact sheet. It works from the disk on a laptop or a phone.

For each clip the person gives:

- **a mark, 1 to 5** (and, if they have a view, one per canon under "a mark per canon");
- **a note**: what decided the mark ("too even, no build", "lovely slow cells");
- **notes pinned to moments**: tap the timeline under the clip (or pause it), type what
  happens there ("froze", "the colour goes muddy") and press Pin. Each is kept with its time
  on the source's clock, the one the report and the shot list use;
- **keep aside** on three or four clips: rated, but never fitted on (step 5).

Ask them to rate from the clip, not from the numbers in the table, and to say in the notes
what decided the mark. The notes are what you read when a score and a rating disagree, and
across a whole round they show what the tool does not measure yet (step 4).

Everything is kept in the browser as they go. **Save ratings.json** downloads the file;
**Load** takes one back in and merges it, so a round can be finished on another device.

## 3. Where ratings.json goes, and what is in it

`reelreader --refit ratings.json` merges the file into the one in the first folder of the
reference library (`$REELREADER_REFERENCES`, else the config's `references`, else
`~/reelreader-references`), keeping the newest mark for each clip and every moment note from
both. Each clip is a key: the name of its folder in the batch, or the name it was kept under
with `--keep`. The rating page stores each clip's measures under `read`, so the file can be
refitted anywhere without the batch's folders.

```json
{
  "dawn-pour-take3": { "overall": 3, "arc": 2, "note": "too even, no build",
                       "moments": [{ "t": 41.5, "note": "the bloom fades too soon" }], "read": { "…": "…" } },
  "frozen-at-12s":   { "overall": 1, "note": "froze", "moments": [{ "t": 12.0, "note": "froze" }], "heldOut": true }
}
```

`overall` is the mark. The canon keys are `unity`, `complexity`, `intensity`, `arc`,
`surprise`, `musicFit` and `restraint` (the canon names themselves work too). The scale does
not matter for agreement, which compares ranks. Other keys (`title`, `updatedAt`) are kept
and ignored.

## 4. Read the agreement, and the notes

Every later run's report card ends with **Agreement with your ratings (Spearman's rho)**: one
figure for the overall mark against the card's mean score, and one per canon the person
marked, each with at least three rated clips and how many. Read it like this:

- **rho 0.6 or more over 8 clips or more**: that canon ranks clips the way this person does.
  Its verdicts can be quoted, saying so ("Arc agrees with your ratings, rho 0.71 over 12").
- **rho between 0 and 0.6, or fewer than 8 clips**: give the canon's measures, not its score.
- **rho below 0**: the canon ranks clips against this person's taste. Say so plainly and leave
  it out.

Then read what the notes keep saying: `reelreader --notes ratings.json` (and `--refit`, and a
batch run once ratings are on file) groups the notes and moment notes into themes, the words
for one fault folded together (froze, frozen, stuck: **freezes**), each with the clips it came
up on, the moments it was pinned to, and the mean mark of those clips against the rest. A
fault named on three clips or more, or any theme on three or more whose clips are rated a
mark lower, is flagged as a **candidate fault check**: something a person sees that the tool
may not measure. Before calling it a fault, watch the pinned moments yourself and say whether
a read already shows it (the Footage read's freezes, the turning read, the dark share).

## 5. Refit

`reelreader --refit` sets the card's bands from the clips this person rated highest (4 and 5
of 5, or their top third) instead of from the real shows the card was calibrated on, and
prints four figures:

- **on clips left out of the fit, one at a time**: the figure to trust;
- **on the clips kept aside**: a second, cleaner check;
- **on the clips it was fitted on**: always flatters a fit; never quote it alone;
- **the real-show card on the same clips**: what the fit has to beat.

It writes `card-fit.json` beside ratings.json. Later runs grade with it, on any footage, only
when its left-out agreement is 0.3 or more over five clips or more, and the card's first line
then says the bands are the person's. Below that the real-show card stays, and the step says
why: rate more clips, spread from bad to good, and refit.

## 6. Judge your own judging

The same set tests Claude's accounts, not only the tool's scores. Before seeing the person's
ratings, watch each clip with the skill and give it 1 to 5 with a one-line reason; then
compare ranks with theirs. Where you disagree, read their note: a fault you missed means the
fault check (honesty rule 4) needs doing more carefully; a taste you did not share means the
lens, not the eye, was off. Keep the comparison with the set, and run it again when the
routine changes.
