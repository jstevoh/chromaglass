/*
  How long a hand must rest on a control before its card comes up (PLAN.md 8j-3).

  The owner found the hover cards in the way: at 380 ms a hand crossing a deck
  woke a card on every third control, and the browser's own `title` tips, which
  nothing on the page can slow, came up at about a second on top of them. One
  number now, for the knob and fader cards (`ui/ControlTip.tsx`) and for every
  `title=` in the app (`titleTips.ts`, which takes the browser's tip off and
  draws the same card after the same wait), so the two cannot drift apart.

  It is the wait from the pointer arriving on a control, every time. There is no
  "a card was just up, so show the next at once" grace between neighbours, as a
  toolbar's tips often have: the owner's complaint was cards appearing while
  moving about, and a grace is exactly that.

  A phone has no hover and does not use this: its cards open on a tap
  (`ControlTip`'s `tap`), and a touch never starts the wait.
*/
export const TIP_DELAY_MS = 1500;
