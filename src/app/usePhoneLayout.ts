import { PHONE_OFF_KEY, wantsPhoneLayout, type PhoneScreen, PHONE_SCREEN_KEY, phoneScreen } from '../lib/phone';
import { useState, useEffect } from 'react';
import type { DeskLayout } from '../lib/deskLayout';

/**
 * Which screen this is: a phone (`lib/phone.ts`, `components/phone/`), a
 * window with room for the desks, or the narrow overlay between; and on the
 * desks, whether the plate is Perform's live one or Design's Preview. Read
 * again on every resize and turn.
 */
interface PhoneLayoutDeps {
  deskLayout: DeskLayout;
}

export function usePhoneLayout({
  deskLayout,
}: PhoneLayoutDeps) {
  /*
    The phone (components/phone/PhoneStage.tsx, lib/phone.ts): a touch screen
    with a phone's short side gets the plate edge to edge and the tools under
    the thumb, instead of the narrow-screen overlay below. Read again on every
    resize and turn, because a phone turned to landscape is still a phone
    (844 wide, which is under the desks' 1024 anyway) and a laptop window
    dragged narrow is still a laptop.
  */
  const readPhone = () => {
    if (typeof window === 'undefined') return false;
    let sessionOff = false;
    try { sessionOff = sessionStorage.getItem(PHONE_OFF_KEY) === '1'; } catch { /* private */ }
    return wantsPhoneLayout({
      query: window.location.search,
      coarse: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      width: window.innerWidth,
      height: window.innerHeight,
      sessionOff,
      path: window.location.pathname,
    });
  };
  const [phone, setPhone] = useState(readPhone);
  /*
    Which of the phone's two screens (lib/phone.ts phoneScreen): Play, the
    listening screen a phone opens on, or every control. Kept on this phone
    when changed from either, so the screen someone went to is the one they
    come back to.
  */
  const [phoneScreenUp, setPhoneScreenUp] = useState<PhoneScreen>(() => {
    if (typeof window === 'undefined') return 'play';
    let stored: string | null = null;
    try { stored = localStorage.getItem(PHONE_SCREEN_KEY); } catch { /* private */ }
    return phoneScreen({ query: window.location.search, path: window.location.pathname, stored });
  });
  const choosePhoneScreen = (to: PhoneScreen) => {
    try { localStorage.setItem(PHONE_SCREEN_KEY, to); } catch { /* private: this visit only */ }
    setPhoneScreenUp(to);
  };
  useEffect(() => {
    const onResize = () => setPhone(readPhone());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Is the desk up?
   *
   * Previously windows narrower than 1024 px dropped out of the desk into the
   * old floating overlay, so snapping a laptop window to half a screen mid-set
   * replaced Perform, Cues, and the tabs with retired controls (PLAN 49c), and
   * 49c routed non-touch windows under 768 px to the phone layout instead.
   * Now every non-touch window keeps the desk down to 360 px: from 1024 px up
   * it draws both side columns; from 768 px to 1023 px it folds them into one
   * column beside the plate; below 768 px it stacks that folded column under
   * the plate. Touch phones and `/play` still get the phone layout. The old
   * floating overlay is unhooked.
   */
  const deskUp = !phone;
  // A phone is never a desk, whatever its width turned sideways.
  /*
    "Performing" was the Gig desk being up: Space is Go, a look picked from
    the palette is cued rather than put up, and the look's clock runs. With
    the tabs the owner's to make, it is the tab's plate being Live: the show,
    whichever panels are round it. Preview is building (below).
  */
  const performing = deskLayout.plateMode === 'live' && deskUp;
  /*
    "Designing" was the Design desk being up. It is now the plate in Preview,
    which is what it always meant to the show: while a look is being built
    the sequencer is held, a song's show does not take the plate over and a
    new song does not change the look under the hand. Build ships in
    Preview, so the bench behaves as it did; Gig and Load-in ship Live, and
    either can be put in Preview from the plate bar.
  */
  const designing = deskLayout.plateMode === 'preview' && deskUp;

  /** The old floating overlay is retired and unhooked (PLAN 49c). */
  const overlayUp = false;

  return {
    phone, setPhone, phoneScreenUp, choosePhoneScreen, performing, designing, deskUp, overlayUp,
  };
}
