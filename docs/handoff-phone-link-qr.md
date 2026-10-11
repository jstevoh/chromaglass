# Handoff: the Phone · iPad panel's code (PLAN 8f-1, for Antigravity)

<!-- Lives in the repo so a session without the project's shared files can read it. -->

The owner's ask (2026-10-11, with a screenshot of the hosted site's panel: "No phone
linked." over three lines of words and no code): "lets put a QR code here when nothing is
linked (and also a way to pull it back up, if we need multiple things connected). The QR
code can go right to the correct website."

Plan: `PLAN.md` 8f-1 (`grep -n '8f-1' PLAN.md`). The check is written and lands with this
file; the build is yours. The branch is `claude/phone-link-qr-u4t55e` and its draft PR
carries `handoff`, so push to it (`docs/handoff.md`, "Claiming").

## What is wrong today (read first)

- `src/components/desk/DeskPanels.tsx`, `PhoneBody`: the code of 8f is drawn only when
  `relayInfo()` answers, which it does only on a page the show server serves (the Mac
  app, `npm run remote`). On the hosted site and under `vite preview` the panel is words.
- The desk never knew whether a phone was linked. `status.phone` (`src/App.tsx`, twice:
  `deskDots` and the `status` prop) is `remoteLink.status === 'connected'`, the display's
  own socket to the relay. With the Mac app up and no phone in the room the panel says
  "A phone is linked and driving the show" and the footer "phone linked". The relay
  (`server/remote-server.js`) counts network displays for the display (`mirrors`, on a
  mirror's hello and close) and says nothing about phones (`controller` sockets).

## The check, written first: `npm run phonelink`

`scripts/phonelink.mjs`; Measure's browser part runs it after `remotemix`. Its header says
what is asked and why. It starts the real show server, opens the desk in Chromium, joins
phones as sockets, then serves `dist/` from `vite preview` as a static host. On `main` it
reads 5 ok, 16 FAIL (what passes today: the relay's code drawn module for module, no button
when none is wanted, and the words naming the show server; everything about the status
line, the count, Link another and the static host's code is red). The target is every
line ok, with the script unchanged. If a line is wrong, say which and why under
"Check changes:" in the PR body; do not loosen it.

## Build (one PR)

1. **The relay counts phones.** In `server/remote-server.js`, where a controller's hello
   passes the key check and where a controller's socket closes, send the displays
   `{ type: 'controllers', count }`, the count of sockets whose role is `controller`,
   exactly as `mirrors` is sent for mirrors. When a *display* says hello, send that
   display the current count too, so a desk opened while phones are already on knows.
   Add `controllers` to `RELAY_ONLY`. Add `{ type: 'controllers'; count: number }` to
   `RemoteMessage` in `src/lib/remoteProtocol.ts`, next to `mirrors`.
2. **The desk holds the count.** `src/App.tsx`: `case 'controllers': setPhoneCount(count)`
   beside `case 'mirrors'`. The count is 0 whenever `remoteLink.status !== 'connected'`
   (no relay, a relay restart). `status.phone` becomes that number in both places;
   `deskDots.phone` is `count > 0`. `DeskProps['status'].phone: number`
   (`src/components/desk/deskProps.ts`). The footer (`src/components/desk/Desk.tsx`,
   `status-running`): ` · 1 phone linked`, ` · 2 phones linked`, nothing at 0. The
   header pill (`DeskPanels.tsx`, `case 'phone'`): `not linked` at 0, else `1 linked`,
   `2 linked`.
3. **The panel** (`PhoneBody`):
   - The address: the relay's, `http://<hosts[0]>:<port>/?remote=1&key=<key>`, when
     `relayInfo()` answers with a host, as today; otherwise the page's own,
     `${window.location.origin}/`, nothing after the slash.
   - A status line, `data-testid="phone-link-status"`, the dot as today (green above 0):
     `No phone linked.` / `1 phone linked.` / `2 phones linked.`
   - At 0 phones the code (`phone-link-qr`), the address (`phone-link-url`) and Copy
     (`phone-link-copy`) are up and there is no button.
   - At 1 or more they are put away and one `Button` (`../ui`, height 32),
     `data-testid="phone-link-more"`, reading `Link another` stands where they were.
     Pressed, it shows them and reads `Put the code away`; pressed again, it puts them
     away. When the count falls to 0 the code is up again and the button gone: reset the
     toggle when the count reaches 0.
   - The words. With a relay, as today: "Point a phone or an iPad on the same Wi-Fi at
     this, or open the address:". Without one: "This page has no show server behind it,
     so the code opens the show on the phone itself. A phone that drives this show links
     through the show server, which runs with the Mac app (or `npm run remote` on this
     machine)." The check asks of the words only that they say "show server" and
     "npm run remote".
   - Looks: the panel's own, nothing new. The same `Button`, the same 13 px and `text-dim`,
     the code white on black as it is (a reader needs the light border). No icon, no
     gradient, no box inside the box. It should read as the rest of the desk does.
   - The comment over `PhoneBody` says why (the count from the relay, not the socket; the
     page's own address when there is no relay), in prose, as the file does.
4. **Phone version:** none to build. The panel is the desk's (the laptop, and the iPad's
   full layout, which draws the same desk); the phone is the device being linked. Say so
   in the PR.
5. **PLAN.md:** strike 8f-1's line as shipped and move its story to
   `docs/plan-shipped.md` under §8, in the same PR.

## Measure before pushing

`npm run lint`; `npm run phonelink` (every line ok); `npm run layout` (its 8f line: a
stubbed relay and no phone, the code up); `npm run remotemix` and `npm run applink` (a
display's hello now receives `controllers`; nothing else changes); `npm run desk`;
`npm run panel`. On the Mac, `npm run qa`. Put the numbers under `Measured:` in the PR body
(`docs/handoff.md`, "The PR body is the handoff note") and any check you touched under
"Check changes:", with the reason. Merge when green, without asking; report the deploy in
Pacific time (`CLAUDE.md`, "Branches, PRs, deploys").
