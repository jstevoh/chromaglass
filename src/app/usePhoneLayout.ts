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

  /** What the desk should say is on stage. */
  /**
   * Is there room for a desk?
   *
   * Perform puts a preview and a control column side by side, which needs a
   * laptop's width. On a narrow window the two columns leave the plate a few
   * pixels and the whole thing is unusable — found by the QA harness, which
   * happened to run the desk check at phone width after the small-screen
   * check had resized the window, and reported a 420px preview in a 420px
   * page. Below this, Perform quietly behaves as Design; a phone has a
   * layout of its own (above), and the remote when it drives a laptop's show.
   */
  const [roomForDesk, setRoomForDesk] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 1024));
  useEffect(() => {
    const onResize = () => setRoomForDesk(window.innerWidth >= 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // A phone is never a desk, whatever its width turned sideways.
  /*
    "Performing" was the Gig desk being up: Space is Go, a look picked from
    the palette is cued rather than put up, and the look's clock runs. With
    the tabs the owner's to make, it is the tab's plate being Live: the show,
    whichever panels are round it. Preview is building (below).
  */
  const performing = deskLayout.plateMode === 'live' && roomForDesk && !phone;
  /*
    "Designing" was the Design desk being up. It is now the plate in Preview,
    which is what it always meant to the show: while a look is being built
    the sequencer is held, a song's show does not take the plate over and a
    new song does not change the look under the hand. Build ships in
    Preview, so the bench behaves as it did; Gig and Load-in ship Live, and
    either can be put in Preview from the plate bar.
  */
  const designing = deskLayout.plateMode === 'preview' && roomForDesk && !phone;

  /*
    Below that width neither desk lays out, and the floating overlay UI — the
    bottle rail, the toolbar, the title bar — is what the app shows instead.
    It is not legacy so much as the narrow-screen surface: a phone has its own
    (PhoneStage), and a small laptop window gets the one that does not need
    three columns.
  */
  const deskUp = roomForDesk && !phone;
  /** The laptop's floating overlay: below the desks' width, and not on a phone. */
  const overlayUp = !deskUp && !phone;

  return {
    phone, setPhone, phoneScreenUp, choosePhoneScreen, performing, designing, deskUp, overlayUp,
  };
}
