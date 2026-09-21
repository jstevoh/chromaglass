/**
 * The case nobody wrote.
 *
 * A `switch` over a union with no `default` is the quietest bug there is. The
 * compiler checks that every case it *does* have names a real member, so a
 * typo is caught — and says nothing at all about a member with no case. Add
 * an action to the union, wire it to a pad and a menu item, forget the
 * switch, and the button does nothing. Nothing throws, nothing logs, nothing
 * is red. It reads as a dead pad.
 *
 * That is the same shape as the settings roll that handed over 33 values as
 * `undefined` and the painter that declined without saying so: a thing that
 * can answer "nothing" where the reader assumes it always answers.
 *
 * Passing the switched value here closes it from both ends.
 *
 * **At compile time** the parameter is `never`, so it only accepts a value
 * the compiler has narrowed to nothing — which happens exactly when every
 * member has a case. Miss one and `tsc` names it. That is stronger than any
 * harness: it cannot be forgotten, it cannot flake, and it fails before the
 * code is ever run.
 *
 * **At run time** it says so out loud. The union is what this build knows,
 * and some of these values arrive over a wire from a phone or a desk that may
 * be a newer build than the display — `RemoteMessage` says as much where it
 * is parsed. Such a value is genuinely unknown rather than a mistake, so it
 * is reported and stepped over rather than thrown: a show does not stop
 * because a pad knew a trick the laptop did not.
 */
export function unhandled(what: string, value: never): void {
  console.warn(`ChromaGlass: ${what} this build does not know — ${JSON.stringify(value)}`);
}
