import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui';
import {
  LIVE_SERVICES, serviceById, keyNameFor, keyProblem, validUrl, newDestinationId,
  loadDestinations, saveDestinations, loadFormat, saveFormat, loadUpload, chosenFor, liveOptionsFor,
  needKbps, uploadAdvice, nativeLive, liveAvailable, liveAllowed, useLiveShow, onAir, startLive, stopLive,
  type LiveDestination, type LiveFormat, type LiveOrientation, type LiveServiceId,
} from '../lib/liveShow';
import { probeVideoEncoders } from '../lib/liveStream';

/**
 * The Live Show panel (PLAN.md 37x-4d): the Mac app streaming the show to
 * every platform the owner has added, at once, Pro only.
 *
 * The owner, 2026-10-29: "open my mac app (pro version only) and configure
 * the live show... stream it on all of the popular streaming platforms".
 * What it holds, in the order a show night goes:
 *
 *  - the destinations, each added by its platform (the server filled in
 *    where the platform has one fixed address), a name, its shape (Instagram
 *    and TikTok take 9:16 only) and its key. The key field is a password
 *    field that is emptied the moment the key is kept: the key goes to the
 *    keychain store in the main process (desktop/keys.js) and never comes
 *    back to the page, so the panel can only say "key kept" and when;
 *  - a destination marked "for tests" (an unlisted YouTube broadcast, the
 *    plan's Test) is streamed by Test and never by Go live, so a rehearsal
 *    cannot reach the public channel by a slip of the finger;
 *  - Go live asks once more, naming where it is about to go, because it is
 *    the one press here that cannot be taken back: a viewer has seen it.
 *    Stop does not ask; at the desk, stopping is never the dangerous way;
 *  - the upload: what these destinations need, with the research's 20%
 *    headroom, against what the last stream measured (lib/liveShow.ts
 *    explains the measure), and a warning when it will not fit;
 *  - while streaming, each destination's own line: on air, retrying,
 *    refused; how much is arriving and how far behind it is.
 *
 * Absent on the website (the panel browser does not list it, lib/liveShow's
 * `liveAvailable`): a page has no RTMPS client to hand the packets to.
 */

const mbps = (kbps: number) => `${(kbps / 1000).toFixed(1)}`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const field = 'h-7 min-w-0 rounded-sm border border-border bg-surface px-2 text-[13px] text-text placeholder:text-faint focus:border-border-strong focus:outline-none';
const chip = (on: boolean) => `h-6 shrink-0 whitespace-nowrap rounded-sm border px-2 text-[11px] font-medium ${on ? 'border-lit bg-lit text-on-lit' : 'border-border text-text-2 hover:bg-hover'}`;

export function LiveShowPanel() {
  const live = useLiveShow();
  const [list, setList] = useState<LiveDestination[]>(() => loadDestinations());
  const [format, setFormat] = useState<LiveFormat>(() => loadFormat());
  const [kept, setKept] = useState<Map<string, string | null>>(new Map());
  const [note, setNote] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [probe, setProbe] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const native = nativeLive();
  const streaming = onAir(live);

  const refreshKeys = useCallback(async () => {
    if (!native) return;
    try { setKept(new Map((await native.keys.list()).map(k => [k.name, k.set]))); } catch { /* the store said nothing */ }
  }, [native]);
  useEffect(() => { void refreshKeys(); }, [refreshKeys]);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

  const change = (next: LiveDestination[]) => { setList(next); saveDestinations(next); };
  const changeFormat = (f: LiveFormat) => { setFormat(f); saveFormat(f); };

  /** Keep a key: the field is the caller's to empty, whatever the store says. */
  const keepKey = async (d: LiveDestination, key: string): Promise<boolean> => {
    const bad = keyProblem(key);
    if (bad) { setNote(`${d.name}: ${bad}`); return false; }
    try {
      await native!.keys.set(keyNameFor(d), key.trim());
      setNote(null);
      await refreshKeys();
      return true;
    } catch (e) {
      setNote(`${d.name}: the key was not kept (${String((e as Error)?.message ?? e)})`);
      return false;
    }
  };
  const remove = async (d: LiveDestination) => {
    change(list.filter(x => x.id !== d.id));
    try { await native?.keys.remove(keyNameFor(d)); } catch { /* gone already */ }
    await refreshKeys();
  };

  const forLive = useMemo(() => chosenFor(list, false).filter(d => kept.has(keyNameFor(d))), [list, kept]);
  const forTest = useMemo(() => chosenFor(list, true).filter(d => kept.has(keyNameFor(d))), [list, kept]);
  const need = needKbps(forLive.length ? forLive : forTest, format);
  const advice = uploadAdvice(need, loadUpload());

  const go = async (test: boolean) => {
    const to = test ? forTest : forLive;
    if (to.length === 0) return;
    if (!test && !armed) {
      setArmed(true);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 5000);
      return;
    }
    setArmed(false);
    setNote(null);
    try { await startLive({ ...liveOptionsFor(to, format), test }); } catch (e) { setNote(String((e as Error)?.message ?? e)); }
  };

  const runProbe = async () => {
    const w = Math.round(format.height * 16 / 9);
    setProbe('Timing the encoder…');
    const r = await probeVideoEncoders(w, format.height, format.fps);
    const best = r.filter(p => p.source === 'canvas' && p.msAFrame != null).sort((a, b) => a.msAFrame! - b.msAFrame!)[0];
    const budget = 1000 / format.fps;
    setProbe(best
      ? `${format.height}p${format.fps}: ${best.msAFrame!.toFixed(0)} ms a frame (${best.acceleration}) against ${budget.toFixed(0)} ms: ${best.msAFrame! <= budget ? 'holds the rate' : 'cannot hold it, try 720p or 30 fps'}`
      : 'No H.264 encoder answered at this size.');
  };

  if (!native || !liveAvailable()) {
    return <p className="text-[13px] text-text-2" data-testid="live-show-absent">The Live Show streams from the Mac app.</p>;
  }
  if (!liveAllowed()) {
    return <p className="text-[13px] text-text-2" data-testid="live-show-pro">The Live Show is part of Pro: stream the show to YouTube, Twitch, Facebook and the rest at once.</p>;
  }

  return (
    <div className="flex flex-col gap-2 text-[13px]" data-testid="live-show" data-phase={live.phase} data-test={live.test ? 'true' : 'false'}>
      <p className="flex items-center gap-2 text-text-2" data-testid="live-show-status">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: streaming ? 'var(--color-live)' : 'var(--color-faint)' }} />
        {streaming
          ? <span className="truncate">{live.phase === 'starting' ? 'Starting' : live.test ? 'Testing' : 'Live'} · <span className="font-mono">{clock(live.seconds)}</span> · {live.names.join(', ')}</span>
          : <span>{live.phase === 'failed' ? 'Stopped: it failed' : 'Off air'}</span>}
      </p>

      {streaming && live.destinations.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-sm border border-border p-1.5" data-testid="live-health">
          {live.destinations.map(d => (
            <li key={d.name} className="flex items-center gap-2 text-[12px]" data-testid={`live-health-${d.name}`} data-phase={d.phase} data-dropping={d.dropping ? 'true' : 'false'}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: d.phase === 'live' ? (d.dropping ? 'var(--color-warn)' : 'var(--color-ok)') : 'var(--color-faint)' }} />
              <span className="min-w-0 flex-1 truncate text-text">{d.name}</span>
              <span className="shrink-0 font-mono text-text-2">
                {d.phase === 'live'
                  ? `${mbps(d.kbps)} Mb/s · ${d.secondsBehind.toFixed(1)} s behind${live.frames > 0 ? ` · ${(live.grabMs / live.frames).toFixed(1)} ms a frame` : ''}${d.dropping ? ' · dropping' : ''}`
                  : d.retryInMs != null ? `retrying in ${Math.ceil(d.retryInMs / 1000)} s` : d.error ? `ended: ${d.error}` : d.phase}
              </span>
            </li>
          ))}
        </ul>
      )}
      {streaming && live.destinations.some(d => d.dropping) && (
        <p className="text-[12px] text-warn" data-testid="live-dropping">The upload is not keeping up: frames are being dropped. Turn a destination off next time, or stream 720p.</p>
      )}
      {(live.error || note) && <p className="text-[12px] text-warn" data-testid="live-note">{note ?? live.error}</p>}

      <ul className="flex flex-col gap-1.5" data-testid="live-destinations">
        {list.length === 0 && <li className="text-text-2">Add where the show goes: each platform's server and stream key.</li>}
        {list.map(d => (
          <DestinationRow
            key={d.id}
            d={d}
            keptAt={kept.get(keyNameFor(d))}
            locked={streaming}
            onChange={(next) => change(list.map(x => x.id === d.id ? next : x))}
            onKey={(key) => keepKey(d, key)}
            onRemove={() => remove(d)}
          />
        ))}
      </ul>

      {!streaming && <AddDestination onAdd={async (d, key) => {
        if (!(await keepKey(d, key))) return false;
        change([...list, d]);
        return true;
      }} />}

      <label className="flex items-center gap-1.5">
        <span className="text-text-2">Source</span>
        <select
          className={`${field} flex-1 disabled:opacity-40`}
          value={format.source ?? 'plate'}
          disabled={streaming}
          onChange={e => changeFormat({ ...format, source: e.target.value === 'stack' ? 'stack' : 'plate' })}
          data-testid="live-source"
        >
          <option value="plate">Plate</option>
          <option value="stack">Mixer stack</option>
        </select>
      </label>

      <div className="flex items-center gap-1.5" data-testid="live-format">
        <span className="text-text-2">Stream</span>
        {([1080, 720] as const).map(h => (
          <button key={h} aria-pressed={format.height === h} className={chip(format.height === h)} disabled={streaming} onClick={() => changeFormat({ ...format, height: h })} data-testid={`live-format-${h}`}>{h}p</button>
        ))}
        {([30, 60] as const).map(f => (
          <button key={f} aria-pressed={format.fps === f} className={chip(format.fps === f)} disabled={streaming} onClick={() => changeFormat({ ...format, fps: f })} data-testid={`live-format-fps-${f}`}>{f} fps</button>
        ))}
      </div>
      <button className="self-start text-[11px] text-text-2 underline-offset-2 hover:underline disabled:opacity-40" onClick={() => { void runProbe(); }} disabled={streaming} data-testid="live-probe">Check the encoder at this size</button>
      {probe && <p className="text-[12px] text-text-2" data-testid="live-probe-result">{probe}</p>}
      {advice.text && (
        <p className={`text-[12px] ${advice.level === 'short' ? 'text-warn' : 'text-text-2'}`} data-testid="live-upload" data-level={advice.level} data-need={need}>{advice.text}</p>
      )}

      <div className="flex items-center gap-1.5">
        {streaming ? (
          <Button key="stop" height={32} full live pressed onClick={() => { void stopLive(); }} testId="live-stop">Stop · {clock(live.seconds)}</Button>
        ) : (
          <>
            <Button key="test" height={32} onClick={() => { void go(true); }} disabled={forTest.length === 0} testId="live-test"
              title={forTest.length ? `Stream to ${forTest.map(d => d.name).join(', ')} only` : 'Mark a destination "for tests" (an unlisted YouTube broadcast) to rehearse on it'}>
              Test
            </Button>
            <Button height={32} full variant={armed ? 'danger' : 'primary'} onClick={() => { void go(false); }} disabled={forLive.length === 0} testId="live-go"
              title={forLive.length ? `Go live to ${forLive.map(d => d.name).join(', ')}` : 'Add a destination with its key, and turn it on'}>
              {armed ? `Go live to ${forLive.length === 1 ? forLive[0].name : `${forLive.length} places`}? Press again` : 'Go live'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function DestinationRow({ d, keptAt, locked, onChange, onKey, onRemove }: {
  d: LiveDestination;
  keptAt: string | null | undefined;
  locked: boolean;
  onChange: (d: LiveDestination) => void;
  onKey: (key: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [key, setKey] = useState('');
  const [editing, setEditing] = useState(false);
  const has = keptAt !== undefined;
  const save = async () => { const v = key; setKey(''); if (await onKey(v)) setEditing(false); };
  return (
    <li className="flex flex-col gap-1 rounded-sm border border-border p-1.5" data-testid={`live-dest-${d.id}`} data-service={d.service}>
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-text" title={d.url}>{d.name}</span>
        <span className="shrink-0 text-[11px] text-faint">{d.orientation === 'portrait' ? '9:16' : '16:9'}</span>
        <button aria-pressed={d.on && !d.test} className={chip(d.on && !d.test)} disabled={locked} onClick={() => onChange({ ...d, on: !d.on || d.test, test: false })} data-testid={`live-dest-on-${d.id}`} title="Go live streams here">On</button>
        <button aria-pressed={d.test} className={chip(d.test)} disabled={locked} onClick={() => onChange({ ...d, test: !d.test })} data-testid={`live-dest-test-${d.id}`} title="Test streams here, Go live never does: an unlisted broadcast">For tests</button>
        <button className="h-6 rounded-sm px-1.5 text-[13px] text-faint hover:bg-hover hover:text-text disabled:opacity-40" disabled={locked} onClick={onRemove} title="Remove it and its key" data-testid={`live-dest-remove-${d.id}`}>×</button>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-text-2">
        <span data-testid={`live-dest-key-${d.id}`} data-kept={has ? 'true' : 'false'}>
          {has ? `Key kept${keptAt ? ` ${new Date(keptAt).toLocaleDateString()}` : ''}` : 'No key yet'}
        </span>
        {!validUrl(d.url) && <span className="text-warn">· no server</span>}
        {!locked && !editing && <button className="ml-auto underline-offset-2 hover:underline" onClick={() => setEditing(true)} data-testid={`live-dest-newkey-${d.id}`}>{has ? 'New key' : 'Add key'}</button>}
      </div>
      {editing && (
        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <input className={`${field} flex-1`} type="password" autoComplete="off" spellCheck={false} placeholder="Paste the stream key" value={key} onChange={e => setKey(e.target.value)} data-testid={`live-dest-keyfield-${d.id}`} />
          <Button height={28} variant="primary" onClick={() => { void save(); }} testId={`live-dest-keysave-${d.id}`}>Keep</Button>
        </form>
      )}
    </li>
  );
}

function AddDestination({ onAdd }: { onAdd: (d: LiveDestination, key: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<LiveServiceId>('youtube');
  const [name, setName] = useState('');
  const [url, setUrl] = useState(LIVE_SERVICES[0].url);
  const [orientation, setOrientation] = useState<LiveOrientation>('landscape');
  const [key, setKey] = useState('');
  const [bad, setBad] = useState<string | null>(null);
  const s = serviceById(service);

  const pick = (id: LiveServiceId) => {
    const next = serviceById(id);
    setService(next.id); setUrl(next.url); setOrientation(next.orientation); setName('');
  };
  const add = async () => {
    const v = key;
    setKey('');
    if (!validUrl(url)) { setBad('the server is an rtmps:// (or rtmp://) address'); return; }
    const d: LiveDestination = { id: newDestinationId(), service, name: name.trim() || s.name, url: url.trim(), orientation, on: true, test: false };
    if (await onAdd(d, v)) { setOpen(false); setBad(null); pick('youtube'); }
  };

  if (!open) return <Button height={28} variant="ghost" onClick={() => setOpen(true)} testId="live-add">+ Add a destination</Button>;
  return (
    <form className="flex flex-col gap-1.5 rounded-sm border border-border-strong p-1.5" onSubmit={(e) => { e.preventDefault(); void add(); }} data-testid="live-add-form">
      <div className="flex items-center gap-1.5">
        <select className={`${field} flex-1`} value={service} onChange={e => pick(e.target.value as LiveServiceId)} data-testid="live-add-service">
          {LIVE_SERVICES.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select className={field} value={orientation} onChange={e => setOrientation(e.target.value as LiveOrientation)} data-testid="live-add-orientation">
          <option value="landscape">16:9</option>
          <option value="portrait">9:16</option>
        </select>
      </div>
      <p className="text-[11px] text-faint">{s.hint}</p>
      <input className={field} placeholder={`Name (${s.name})`} value={name} onChange={e => setName(e.target.value)} data-testid="live-add-name" />
      <input className={field} placeholder="Server: rtmps://…" spellCheck={false} value={url} onChange={e => setUrl(e.target.value)} data-testid="live-add-url" />
      <input className={field} type="password" autoComplete="off" spellCheck={false} placeholder="Stream key" value={key} onChange={e => setKey(e.target.value)} data-testid="live-add-key" />
      {bad && <p className="text-[12px] text-warn">{bad}</p>}
      <div className="flex items-center gap-1.5">
        <Button height={28} variant="primary" onClick={() => { void add(); }} testId="live-add-save">Add</Button>
        <Button height={28} variant="ghost" onClick={() => { setOpen(false); setKey(''); setBad(null); }} testId="live-add-cancel">Cancel</Button>
      </div>
    </form>
  );
}
