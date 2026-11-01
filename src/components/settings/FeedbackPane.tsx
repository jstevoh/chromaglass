import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button, LIT, Toggle } from '../ui';
import { getCachedEmail, isSignedInCached, onAuthFlagChange } from '../../lib/authFlag';
import {
  FEEDBACK_MAX, FEEDBACK_TOPICS, FEEDBACK_URL, SUPPORT_EMAIL, buildFeedback, feedbackMailto, sendFeedback,
  type FeedbackTopic,
} from '../../lib/feedback';

/*
  Settings → Feedback (PLAN 39a).

  Not a section of settings: it changes nothing on the plate, so it is not in
  `SETTINGS_SECTIONS`, is never a desk panel and never pinned, and the search
  does not find it as a place full of controls. It is the last row of the
  rail, under the seven groups, and the pane it opens; the phone's Settings
  sheet is the same panel, so the phone has it at the end of its strip, and
  the phone's menu has a Feedback tile that opens the sheet straight at it.

  What is sent is said on the pane, and the two boxes that add the log and the
  picture are ticked, in sight, and untickable before Send: a note about a
  glitch is nearly useless without the log, and someone who would rather not
  share it can see that it would go and stop it. "See what is sent" shows the
  JSON itself, scrubbed the way it will leave, so the claim can be checked.
*/
export function FeedbackPane({ card, title }: {
  /** The sheet's card and title classes, so the pane sits like the sections beside it. */
  card: string; title: string;
}) {
  const [topic, setTopic] = useState<FeedbackTopic>('bug');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [logs, setLogs] = useState(true);
  const [picture, setPicture] = useState(true);
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; id: string } | { kind: 'error'; text: string }>({ kind: 'idle' });
  const [preview, setPreview] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(() => (isSignedInCached() ? getCachedEmail() : null));
  useEffect(() => onAuthFlagChange(() => setAccount(isSignedInCached() ? getCachedEmail() : null)), []);

  const ready = message.trim().length > 0 && state.kind !== 'sending';

  const send = async () => {
    if (!ready) return;
    setState({ kind: 'sending' });
    try {
      const body = await buildFeedback({ topic, message, replyTo: account ?? replyTo, logs: !!FEEDBACK_URL && logs, picture: !!FEEDBACK_URL && picture });
      if (!FEEDBACK_URL) {
        // No Worker on this build: the same note as an email, without the log.
        window.location.href = feedbackMailto(body);
        setState({ kind: 'idle' });
        return;
      }
      const id = await sendFeedback(body);
      setState({ kind: 'sent', id });
      setMessage('');
      setPreview(null);
    } catch (e) {
      setState({ kind: 'error', text: e instanceof Error ? e.message : 'Something went wrong sending that.' });
    }
  };

  const showPreview = async () => {
    if (preview !== null) { setPreview(null); return; }
    // The picture is shown as its size, not 150 kB of base64.
    const body = await buildFeedback({ topic, message: message || '(your note)', replyTo: account ?? replyTo, logs, picture });
    const pic = body.picture ? { ...body.picture, dataUrl: `(a JPEG, ${Math.round(body.picture.dataUrl.length * 0.75 / 1024)} kB)` } : null;
    setPreview(JSON.stringify({ ...body, picture: pic }, null, 2));
  };

  return (
    <section className={`${card} border-white/[0.07]`} data-testid="settings-feedback">
      <h3 className={title}>
        <MessageSquare size={12} /> Feedback
      </h3>
      <p className="mb-4 text-[12px] leading-relaxed text-white/55">
        Tell us what broke, what you wish it did, or what you love. Every note is read, kept, and goes
        to {SUPPORT_EMAIL}.
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="What is it about">
        {FEEDBACK_TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={topic === t.id}
            onClick={() => setTopic(t.id)}
            className={`min-h-9 pointer-coarse:min-h-12 rounded-full border px-3 text-[12px] transition-colors ${topic === t.id ? LIT : 'border-white/[0.1] text-white/65 hover:bg-white/[0.05] hover:text-white'}`}
            data-testid={`feedback-topic-${t.id}`}
          >
            {t.name}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={(e) => { setMessage(e.target.value.slice(0, FEEDBACK_MAX)); if (state.kind !== 'sending') setState({ kind: 'idle' }); }}
        rows={6}
        maxLength={FEEDBACK_MAX}
        placeholder={topic === 'bug' ? 'What happened, and what were you doing just before?' : 'Tell us…'}
        aria-label="Your feedback"
        className="w-full resize-y rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] leading-relaxed text-white/90 outline-none placeholder:text-white/30 focus:border-accent-border pointer-coarse:text-[16px]"
        data-testid="feedback-message"
      />
      <div className="mb-3 mt-1 text-right text-[11px] text-white/30">{message.length} / {FEEDBACK_MAX}</div>

      {account ? (
        <p className="mb-3 text-[12px] text-white/50" data-testid="feedback-account">We will answer at {account}.</p>
      ) : (
        <input
          type="email"
          value={replyTo}
          onChange={(e) => setReplyTo(e.target.value)}
          placeholder="Your email, if you would like an answer (optional)"
          aria-label="Your email"
          autoComplete="email"
          className="mb-3 h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-white/90 outline-none placeholder:text-white/30 focus:border-accent-border pointer-coarse:text-[16px]"
          data-testid="feedback-reply-to"
        />
      )}

      {FEEDBACK_URL ? (<>
      <div className="mb-1">
        <Toggle label="Include the app's recent log and this look's settings" on={logs} onChange={(v) => { setLogs(v); setPreview(null); }} testId="feedback-logs" />
        <Toggle label="Include a picture of the plate" on={picture} onChange={(v) => { setPicture(v); setPreview(null); }} testId="feedback-picture" />
      </div>
      <p className="mb-4 text-[11px] leading-relaxed text-white/40">
        Always sent: the app's version, this browser and screen, the graphics card, the look's name, whether Evolve and a projector are on, and your plan. Never sent: passwords,
        licence keys, stream keys or sign-in tokens; they are taken out of the log first.{' '}
        <button type="button" onClick={showPreview} className="underline decoration-white/25 underline-offset-2 hover:text-white" data-testid="feedback-preview-toggle">
          {preview === null ? 'See what is sent' : 'Hide it'}
        </button>
      </p>
      {preview !== null && (
        <pre className="mb-4 max-h-64 overflow-auto rounded-lg bg-black/40 p-3 text-[10.5px] leading-snug text-white/60" data-testid="feedback-preview">{preview}</pre>
      )}
      </>) : (
        <p className="mb-4 text-[11px] leading-relaxed text-white/40" data-testid="feedback-mail-only">
          Send opens your mail app with the note, the app's version and the look's name in it. The log
          cannot go by email; describe what happened as best you can.
        </p>
      )}

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Button variant="primary" onClick={send} disabled={!ready} testId="feedback-send">
          {state.kind === 'sending' ? 'Sending…' : FEEDBACK_URL ? 'Send' : 'Email it'}
        </Button>
        <div className="min-h-5 text-[12px]" aria-live="polite" data-testid="feedback-status">
          {state.kind === 'sent' && <span className="text-emerald-300/90">Thank you. It is in{state.id ? `, as ${state.id}` : ''}.</span>}
          {state.kind === 'error' && (
            <span className="text-amber-200/90">
              {state.text} <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
