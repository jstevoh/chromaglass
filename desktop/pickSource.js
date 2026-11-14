/*
  Which window or screen a picture-only `getDisplayMedia` films (Film → a
  window, from the desk or from the assistant): the person at the Mac picks it.

  What was found (the security review of 2026-11-13): the handler in main.js
  took `desktopCapturer.getSources(...)[0]`, the first window macOS listed,
  with no picker at all. That is whatever window was frontmost or first, Mail
  or a password manager as easily as the film the owner meant, and in Full
  mode an assistant talked round by a web page or a track title could ask for
  it and then go live, so it went out on the public stream and to every cast.
  The owner chose (2026-11-13) to keep the assistant's window filming but to
  have it ask: the window is picked by a hand, on this Mac, every time.

  Why a message box and not macOS's own picker: Electron's `useSystemPicker`
  is a whole-session switch, and the same handler gives System audio its
  loopback with no picker at all (main.js), which a system picker would break.
  A sheet on the show's window is asynchronous, so the plate keeps drawing
  while it waits, and an unanswered sheet films nothing. Buttons are the
  windows' and screens' names, at most MAX_CHOICES of them, then Cancel.
*/
export const MAX_CHOICES = 12;

/**
 * Asks which of `sources` to film. Answers the chosen source, or null when the
 * person cancels or there is nothing to choose. `showMessageBox` is Electron's
 * `dialog.showMessageBox` bound to the show's window (a stand-in in checks).
 */
export async function pickSource(sources, showMessageBox) {
  const list = (Array.isArray(sources) ? sources : []).filter((s) => s && typeof s.name === 'string').slice(0, MAX_CHOICES);
  if (!list.length) return null;
  const names = list.map((s, i) => (s.name.trim() || `Window ${i + 1}`).slice(0, 60));
  const cancel = names.length;
  const r = await showMessageBox({
    type: 'question',
    message: 'Film which window onto the plate?',
    detail: 'Something asked to film a window (the desk, or the assistant). Nothing is filmed until you choose.',
    buttons: [...names, 'Cancel'],
    defaultId: cancel,
    cancelId: cancel,
  });
  const i = typeof r?.response === 'number' ? r.response : cancel;
  return i >= 0 && i < list.length ? list[i] : null;
}
