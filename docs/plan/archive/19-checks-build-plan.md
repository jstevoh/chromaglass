# Archive: 19. The checks, the build and the plan itself

The closed items of [`docs/plan/19-checks-build-plan.md`](../19-checks-build-plan.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 19k. One manifest of checks

- **19k-8** (E, S): **shipped**, the soap's two checks (`soap`, `soapbreak`) in a sixth Measure
  part `lab3`, since `lab2` ran 24:18 of its 25 minutes with them. Story in `docs/plan-shipped.md` §19k-8.
- **19k-9** (E, S): **shipped**, the browser part's last sixteen checks in a seventh Measure
  part `browser2`, cut at `applink`, which builds `dist/` for the ones after it. Story in
  `docs/plan-shipped.md` §19k-9.
- **19k-11a, shipped 2026-11-07 (#688).** `lab` was cancelled at 25:00 on both of #688's
  attempts, on the slow tier: the first in holeline at ten minutes, the second with all 11
  checks green in 24:34 (holeline 10:19), the job's own setup taking it past the limit;
  `lab3` ran 8:29 beside it. `sloshgpu` (2:33), `soapgpu --selftest` (0:53, beside the soap
  checks it controls) and `beadmask` (0:46) moved to `lab3`. With holeline in `lab4` since
  #690, `sloshgpu` and `beadmask` went back to `lab`, and `soapgpu` stays by the soap.
- **19k-11c, shipped 2026-11-13** (E, S). **`lab4` over its 25 minutes on the slow tier.**
  `glint` (47e, #833) and `bubbleair` had joined `holeline`, `encode --grids` and `shaderdials`
  in `lab4`, and on GitHub's slow ubuntu tier it was cancelled at the limit on two of the day's
  four PR runs (#842 and #835), no check failing: about 15 minutes of checks ahead of
  holeline's 11. `glint` moved to `lab9` (3:50 that day) and `bubbleair` to `lab8` (4:24);
  no bar, timeout or check body changed, only each check's shard in `scripts/checks.json`
  and the comment above `timeout-minutes` in `checks.yml`. The bound stays 25.
- **19k-15** (E, S): **shipped**, `ears`'s covered line holds each tick to the wall's ask
  before it (more than 250 ms after, EAR_ASK_HOLD_MS) rather than wanting none; red on GitHub's
  Macs on #718 and #734 at one tick each. Story in `docs/plan-shipped.md` §19k-15.
- **19k-20, shipped** (E, S): `ears`'s windows last until the runner has offered enough (30 frames, asks, page turns or level samples; 2 to 15 s), bars unchanged; the covered line counts asks against frames drawn without the ticks. Story in `docs/plan-shipped.md` §19k-20
- **19k-16, shipped** (E, S): `draftwall --frames` opened the wall before the show's first step, so its 8 s count of painted frames could end before the opening did (0 painted on 5 of 54 runs); it waits for the show now (docs/plan-shipped.md, 19k-16).
- **19k-18, shipped** (E, S): `lab2` over its 25 minutes on #802's deploy, twice, every check green; the moiré sheets' check moved to a part of its own, `lab9` (docs/plan-shipped.md, 19k-18).
- **19k-17, shipped** (E, S): `lab5` over its 25 minutes on every speed-hunt PR; the ink title's thin arms and the logo melt moved to `lab6`, and `inktitle` from `lab3` to `lab7` (docs/plan-shipped.md, 19k-17).
- **19k-12, shipped** (E, S). **The Mac's fifth shard over its 20 minutes.** After #655 (2 mm,
  whose rim and lens checks read 9x the steps) fifth's checks ran 18:45 on its PR, and on main's
  deploys 668 and 669 the job was cancelled at 20:20 with every check it reached green (668 also
  cancelled open at 19:27, a slow runner; 669 also read reds in oscout, ears and startup 1b, 19aa-7,
  each green on the runs either side). Before #655 fifth ran 17:14 and 17:48. `mirror` (85 s, the
  shard's last) moved to `show`, which ran 15:56 and 16:23 on those deploys; no bound moves. The
  same day deploy 667 was cancelled in `lab` at 24:30 of its 25, all eleven green: 19k-11 again.
