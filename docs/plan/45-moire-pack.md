# 45. The moiré pack: printed sheets on the stage, sold as an art pack

**Asked 2026-11-03** by the owner, from a liquid light shop's post of its moiré transparency
sets (two printed line sheets stacked on the overhead, the top one turned by hand): "let's
create an add-on pack for sale of this". The owner chose on 2026-11-07: a Home add-on,
included in Pro (Pro has every art pack, PLAN 23), with a minute's try for everyone else;
and "a couple different designs that the other dude isn't selling, so it doesn't seem like a
rip-off". So six sheets are the shapes every moiré set prints, drawn in our own way, and four
are sheets film cannot be printed as.

The physics, which the shader keeps (`src/gpu/wgsl/plateMoire.ts`): light through two
printed sheets is the product of their transmissions, and two gratings of nearly the same
pitch multiply into their difference, the slow fringe. Ink passes 2%, the film 92%. A sheet
off the plane the lens focuses on (the liquid) is seen through a disc of confusion of its
distance times the lens's half-angle (0.12). The lower sheet lies under the glass and is seen
through the liquid, bent by (1 - 1/n) of the surface's slope, so a moiré magnifies the edge of
every pool and drop into its fringes, the way a moiré deflectometer measures a surface. Each pixel is
the exact box integral of the printed square wave, so the screen's grid adds no moiré of its
own. Check: `npm run moire`.

- **45a. The sheets on the plate, the desk, the phone and six looks** (**shipped**, this
  PR). Ten designs (`lib/moire.ts` `MOIRE_SHEETS`): Lines, Rings, Spokes, Spiral, Dot
  Screen, Waves, and ours, Quasicrystal (five-fold, never repeats), Colour Inks (cyan,
  magenta and yellow at the printer's screen angles), Song Groove (a record's groove, its
  wiggle patched to the bass) and Zoom Grid (log-polar: the beat spirals inward for ever).
  Settings `moireAmount` (0 by default, so every look is as it was), the two sheets, Turn,
  Spin (on the stage's clock, `lib/stageClocks.ts`), Slide, Scale, Lines, Gap (mm), Curl and
  Flip (the upper sheet face down, which is what crosses two spoke sheets into diamonds). The
  desk's **Moiré Sheets** section, the phone's Looks sheet (`phone/PhoneMoire.tsx`), MIDI
  for the ink, Turn and Spin. Six looks in the look menu's **Moiré pack** group
  (`presetsMoire.ts`). Gate: `canUseMoirePack` in tierGates, open where tiers are not
  enforced, Pro where they are; a look of the pack opens the account sheet when locked.
  A pack look is its house look's plate under its own id (`plateLook`, presetPlate.ts:
  dyes, pours, dish, areas and seed), and a sheet's cord takes the last of the house look's
  cords, so every look keeps 28i-3b's two or three; Quasicrystal Garden and Zoom Tunnel print
  their sheets at 0.6 ink, since at full ink their dense patterns left under a fifth of the
  frame for the dye (`npm run litstage` c4) and the lamp under 6% of the picture
  (`npm run lampzero`). `npm run grainedge` asks the grain under the sheets, as it asks it
  under Roy's print.
  Found while building it, not done:
  - ~~**45a-2. Selling it to Home.**~~ **Shipped** (2026-11-07): a `packs` list in the signed
    key, the store's Moiré Pack product ($15 once) re-signing the buyer's Home key, the account
    sheet's Buy line and the section's Get it (`npm run license-worker` 13g–13q, `npm run tiers`
    14); story in `docs/plan-shipped.md` §45a-2.
  - ~~**45a-8. The website sells the pack.**~~ **Shipped** (2026-11-07, with 45a-2): a card
    under the landing page's price cards with four frames of the pack drawn on the Mac's GPU
    (`public/landing/moire/`, 960x600 for a 480x300 box so the fine lines do not beat against
    the screen), its own Buy, and a row in `pro.html`'s tier table (`npm run signin` 11b reads
    the card, its Buy and that all four pictures load).
  - **45a-9. A pack bought before Home is held, not refunded.** The Worker holds a pack order
    with no Home key on file (`holdOrder`, reason `pack with no Home key`) for the owner to
    refund by hand. If buyers do this, file the pack against the email and apply it when the
    Home key is filed, rather than asking the owner to refund.
  - **45a-10. Song Groove shows no fringes in a still.** Photographed for the website on the
    Mac's GPU 18 s after it opened (`?look=moire-groove`, the other five drawing their
    fringes in the same run), the frame was Cell Bloom's dye and grain with no sheet lines
    anywhere. Either the groove's lines are finer than a pixel at 256² and the gap's blur
    takes them, or the lamp is not under them; find which, and make the look read.
  - **45a-3. A hand on the sheet.** The real thing is played by turning the top sheet with a
    hand. A Turn Sheet tool (drag round the centre sets the turn, a flick spins it), on the
    desk, the phone's pad and the remote, as the Spin tool is built (`SpinHand`); the
    visualizer has no room until its tool handling moves to a module (19ai-10).
  - **45a-4. Defocus, two shortcuts.** Each sheet is blurred by the lens's disc taken as a
    tent of the same variance, which keeps the loss of contrast and not the jinc's reversal
    of a pitch finer than its first zero; and the two blurred sheets are then multiplied,
    where the lens averages their product over its cone. For sheets either side of the
    liquid a ray crosses them displaced opposite ways, so the fringe blurs as a grating of
    kA + kB: at the default 3 mm and 48 lines, to 0.91 of its contrast where the shader
    draws 0.95, and further apart at a deep gap. Do the cone's average per harmonic pair if
    the owner sees the difference on the wall.
  - **45a-5. The closeup through the sheets.** The macro closeup is a camera on the plate and
    draws no sheets; a closeup of a moiré look shows the liquid alone. Draw the sheets in
    plate coordinates at the closeup's zoom.
  - **45a-6. The phone's look list.** The phone groups looks in `App.tsx`'s `phoneLooks`, so
    the pack's six sit in Light show there rather than in their own group; the desk's menu
    groups them. Needs room in `App.tsx` (over budget) or the grouping moved to a lib.
  - **45a-7. Judging on the wall.** How the six looks and the defocus read at 60 fps on a real
    projector (`docs/judging.md`).
