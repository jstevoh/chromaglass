# 34. What Photism showed: the page and the app (asked 2026-10-22): what shipped

How §34's shipped items were found, built and measured. The open work is in
[`docs/plan/34-photism.md`](../plan/34-photism.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 34. What a competitor's page showed

#### 34a. A landing page before the sign-in wall (2026-10-22)

What was reported: a first visit loaded the app ("Warming the lamp") and landed on a name over
three sign-in buttons. It said nothing of what ChromaGlass is or costs, and asked for an account
before the visitor had seen a drop of dye. A competitor's page (PLAN 34) showed the gap: a promise,
a price, pictures of the product, and a way in that needs no account.

What changed: `Landing.tsx` (its own chunk; the entry chunk grew 517 B gzipped against a 6000 B
bar, and the engine and Firebase are not in it) is drawn in the sign-in's place on a first visit to
the hosted site. A headline, one plain line, "Play free", the prices ("Home $35 · Pro $199 · one-time
payment, no subscription"), eight real looks from the app's own renders, four steps, what the free
site includes and what the app adds (read from `APP_FEATURE_TILES` and the free caps in
`tierGates.ts`, so the page says what the code does), a note from the maker and the refund line
(14 days, from the Terms). "Play free" mounts the sign-in over the page; the tab remembers it
(sessionStorage) because Google and Apple sign in by a redirect that reloads the page and the
sign-in is what collects it. The never-lock-out rule is untouched: the page exists only in the
gate's "signin" phase, before the app, and nothing after it unmounts the plate.

What was tried first and set aside: a looping video of the lab's plate for the hero. The lab lays
a few drops that barely move in a hero's seconds (four frames 150 solver steps apart were
near-identical), and a render took four minutes on SwiftShader. A cross-fade of five real frames
costs 40 KB and moves only by opacity and transform. A filmed loop is PLAN 34a-2.

Measured (`npm run signin` 16/16; `layout` 74/74; `panel` 192/192): Play free is 48 px tall at
1024 × 768, 390 × 844 and 844 × 390, with nothing wider than the screen; a returning visit's plate
comes up in 0.9 s against 1.1 s for a build with no sign-in; the landing is never drawn for a
returning visit nor for `?remote` and `?cast`.

#### 34a-5. The page's words, rewritten (2026-10-28)

Asked: the owner wanted the landing page's words looked at again, and decided there is no free
beta of the paid app. The page never said "beta", but it did not say the free website was more
than a taste, never named the $164 upgrade, and its maker note and refund line gave no way to
reach anyone ("say so and I will make it right").

What changed, each line approved by the owner from a draft that put the old and new words side
by side with a reason: the headline says the show is played, not only that it moves ("A liquid
light show you play to your music."); the subline names both audiences, a gig and a living room;
the line under the buttons and the pricing paragraph say the website is free for good and not a
trial; the pricing paragraph names the upgrade's $164; the maker note and the refund line link
support@chromaglass.art; "the solver" became "the app" for a home listener; the search and share
descriptions follow the headline. The layout, tier lists, steps and look lines are untouched.

Measured: `npm run signin` 28/28 (the landing's own lines among them), `layout` 81/81; at 390 ×
844 and 1440 × 900 the page has 0 px of sideways overflow and the new headline fits the hero.

## Fourth pass (moved 2026-10-29, 19m-2)

### 34. What Photism showed: the page and the app (asked 2026-10-22)

#### 34a. A landing page before the sign-in wall

- **34a. A landing page before the sign-in wall.** *Shipped (2026-10-22), first version; the
  story is in `docs/plan-shipped/34-photism.md` §34a, the owner's look is `docs/judging.md` §62.* A first
  visit meets `src/components/Landing.tsx` (its own lazy chunk, no Firebase, no engine) and
  "Play free" opens the sign-in over it; a returning visit, `?remote`, `?cast`, the iPhone app,
  a desktop launch and a visit part way through a redirect or an emailed link never see it.
  `npm run signin` holds it (3a, 3, 6, 7, 10, 11b).
