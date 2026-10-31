# 39. Feedback from inside the app (asked 2026-10-30)

Asked 2026-10-30: "a feedback panel in settings. It should send me an email with the
feedback as well as collect it all in a single database with all of the relevant related
logs data so I can track feedback over time."

## ~~39a. Settings → Feedback, mailed and kept~~ — **Shipped, this PR** (the pane under the rail's seven groups and on the phone's More sheet, `src/components/settings/FeedbackPane.tsx`; the note, its context and the consented log and picture, `src/lib/feedback.ts`, scrubbed by `src/lib/feedbackScrub.ts`; the Worker with one D1 table and a Resend mail, `server/feedback-worker.js`, `server/feedback-schema.sql`, `wrangler.feedback.toml`; `npm run feedback-worker` 24/24; `npm run phone` adds the sheet and the strip's row; story in `docs/plan-shipped.md` §39a)

## 39b. Switch it on (the owner's account steps)

Until these are done the pane sends by mail (it opens the sender's mail app addressed
to support@, with the note and the short context but no log), so nothing is lost
meanwhile. In order, each in `wrangler.feedback.toml`'s header:

1. A Resend account, and `chromaglass.art` added as a sending domain: its DKIM record
   and the MX and SPF on `send.chromaglass.art` go in at the DNS host beside the
   forwarder's root MX, which they leave alone.
2. `npx wrangler d1 create chromaglass-feedback`, its id into the toml, and the schema
   run against it (`--remote --file server/feedback-schema.sql`).
3. The secrets `FEEDBACK_TOKEN`, `RESEND_API_KEY` and `IP_SALT`, then
   `npm run deploy:feedback`.
4. The repository secret `VITE_FEEDBACK_URL` (`https://<the Worker>/feedback`); the
   next deploy of the site and the next Mac app build carry it.
5. One note sent from the live site, seen in the inbox and in the table.

## 39c. A page to read it over time

The table answers SQL from a terminal (`wrangler d1 execute … --command`), and the
Worker answers `GET /feedback?days=N` with the token. What it lacks is a page: the
notes by week and topic, each with its picture and log a click away, and new, read and
done set from there (the Worker already takes `POST /feedback/<id>/status`). An
owner-only page, so it signs in and the Worker checks the owner's account rather than
a token pasted into a browser. (M)

## 39d. Answer from support@

A note's mail has Reply-To set to the sender, so a reply goes straight back, but from
the owner's own mailbox: the forwarder only receives. Sending as support@ needs an SMTP
relay (the forwarder's is paid; Resend's is on the same verified domain as 39b), set
as Gmail's "Send mail as". (S, an account step)

## 39e. The Mac app's own log in a note

A note from the Mac app carries the page's black box but not the main process's: the
show server, the updater, the live stream. A preload call that hands over the main
process's last lines, scrubbed the same way, would put a stream that would not start
in the note about it. (S)
