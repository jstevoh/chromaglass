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
- **Keep three or four aside** and do not rate them until the end: they are the check that
  agreement was not fitted to the clips it was measured on.
- Same window length for each (30 to 60 s), same frame count, and crop each to the picture
  if the camera shows a room.

## 2. Watch them as a batch and rate them

A batch run watches a folder (or a playlist) and writes a table across the videos and a
**rating page**: one HTML file, no server and no account, that plays each clip beside its
sheet. The person gives each clip 1 to 5 (overall, and per canon where they have a view) and
a short note, then presses export, which saves `ratings.json`.

Ask them to rate from the clip, not from the numbers beside it, and to say in the note what
decided the mark ("froze at 0:12", "lovely slow cells"). The notes are what you read when a
score and a rating disagree.

## 3. Where ratings.json goes, and what is in it

Save it in the first folder of the reference library (`$REELREADER_REFERENCES`, else the
config's `references`, else `~/reelreader-references`). Each clip is a key: the name it was
kept under with `--keep`, so the tool finds its `design.json` beside it, or any name, with
the clip's read (its `design.json`) stored under `read`.

```json
{
  "dawn-pour-take3": { "unity": 4, "intensity": 3, "arc": 2, "surprise": 2, "restraint": 5, "overall": 3, "note": "too even, no build" },
  "frozen-at-12s":   { "unity": 3, "intensity": 3, "arc": 1, "surprise": 1, "restraint": 2, "overall": 1, "note": "froze at 0:12" }
}
```

The canon keys the agreement reads are `unity`, `complexity`, `intensity`, `arc`, `surprise`,
`musicFit` and `restraint` (the canon names themselves work too). The scale does not matter:
agreement compares ranks, so 1 to 5 and 0 to 10 give the same answer. `overall` and `note` are
kept for the person and for you.

## 4. Read the agreement

Every later run's report card ends with **Agreement with your ratings (Spearman's rho)**, one
figure per canon with at least three rated clips, and how many. Read it like this:

- **rho 0.6 or more over 8 clips or more**: that canon ranks clips the way this person does.
  Its verdicts can be quoted, saying so ("Arc agrees with your ratings, rho 0.71 over 12").
- **rho between 0 and 0.6, or fewer than 8 clips**: give the canon's measures, not its score.
- **rho below 0**: the canon ranks clips against this person's taste. Say so plainly and leave
  it out.

Then rate the clips kept aside and check that agreement holds on them. If it falls apart,
the agreement was luck: say that too.

## 5. Refit, if your copy has it

A refit step sets the card's bands from the person's own ratings instead of the two shows
(the tool's `--help` lists it when it is there). After a refit, agreement on the clips kept
aside is the only honest test: a refit always agrees with the clips it was fitted to.

## 6. Judge your own judging

The same set tests Claude's accounts, not only the tool's scores. Before seeing the person's
ratings, watch each clip with the skill and give it 1 to 5 with a one-line reason; then
compare ranks with theirs. Where you disagree, read their note: a fault you missed means the
fault check (honesty rule 4) needs doing more carefully; a taste you did not share means the
lens, not the eye, was off. Keep the comparison with the set, and run it again when the
routine changes.
