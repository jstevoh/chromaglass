import { ChevronLeft, Play, Square, ListMusic } from 'lucide-react';
import { SwitchPill, Tag } from './ui';
import type { RemoteMessage, RemoteState } from '../lib/remoteProtocol';

/**
 * The remote's Songs screen (PLAN 12-ctl-1): the laptop's set list and its
 * song shows, one tap from Draw and from Controls.
 *
 * What a performer reaches for between songs is not a dial but the next
 * thing: the next item of the set armed for the Go, the song's show started
 * or stopped when the band goes off the plan, Follow songs off for a jam.
 * Those live on the Perform desk's Set list and Songs panels, and here they
 * are the same calls (app/setNow.ts, app/songShowNow.ts), sent by id.
 *
 * Every mark on this screen is the laptop's: the live item, the armed one, the
 * show running and the Follow switch are read from the state the laptop sends
 * back, never set by the tap. A tap the laptop refused (the item gone from the
 * set, the show deleted) would otherwise show a cue the Go will not play, and
 * the performer would find out on the wall. The cost is a frame of latency on
 * the mark, which on a show network is a few tens of milliseconds.
 *
 * Rows are 56 points, a thumb, and the names wrap rather than truncate: "Dark
 * Star (Live at Fillmore East)" cut at "Dark St…" is no help at arm's length.
 * On an iPad the two lists sit side by side, so a whole set and its shows are
 * in view at once.
 */
export function RemoteSongs({ state, send, connected, onBack, backLabel }: {
  state: RemoteState | null;
  send: (m: RemoteMessage) => void;
  connected: boolean;
  onBack: () => void;
  backLabel: string;
}) {
  const set = state?.setList;
  const songs = state?.songs;
  const row = 'flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.99] disabled:opacity-40';
  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        touchAction: 'manipulation',
        overscrollBehavior: 'none',
      }}
      data-testid="remote-songs"
    >
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#0a0a0a]/95 px-4 py-3 backdrop-blur">
        <button onClick={onBack} className="flex h-11 items-center gap-1 rounded-full border border-white/10 px-3 text-[13px] font-medium text-white/75" data-testid="remote-songs-back">
          <ChevronLeft size={16} /> {backLabel}
        </button>
        <h1 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
          <ListMusic size={15} /> Songs
        </h1>
        <span className={`ml-auto h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} title={connected ? 'Linked' : 'Not linked'} />
      </header>

      <main className="px-4 pt-4 md:grid md:grid-cols-2 md:gap-8 md:px-8">
        <section className="mb-8" data-testid="remote-set">
          <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">Set list{set?.name ? ` · ${set.name}` : ''}</h2>
          <p className="mb-3 text-[12px] text-white/40">Tap to arm for the next Go.</p>
          {!set?.items.length && <p className="text-[13px] text-white/45" data-testid="remote-set-empty">The set list on the laptop is empty.</p>}
          <div className="flex flex-col gap-2">
            {set?.items.map((item, i) => {
              const live = set.liveId === item.id;
              const cued = set.cuedId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => send({ type: 'cue-set-item', id: item.id })}
                  disabled={!connected}
                  data-testid={`remote-set-item-${item.id}`}
                  data-live={live ? 'true' : 'false'}
                  data-cued={cued ? 'true' : 'false'}
                  aria-pressed={cued}
                  className={`${row} ${live ? 'border-live-border bg-live-bg' : cued ? 'border-accent-border bg-elevated' : 'border-white/10 bg-white/5'}`}
                >
                  <span className="w-6 shrink-0 font-mono text-[12px] text-white/35">{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1 text-[15px] font-medium text-white/90">{item.name}</span>
                  {live && <Tag tone="live">Live</Tag>}
                  {cued && <Tag tone="next">Next</Tag>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-8" data-testid="remote-song-shows">
          <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">Song shows</h2>
          {/* The desk's Follow songs switch (the Songs panel's songs-follow), not the songFollow dial. */}
          <button
            type="button"
            role="switch"
            aria-checked={!!songs?.follow}
            onClick={() => send({ type: 'song-follow', on: !songs?.follow })}
            disabled={!connected || !songs}
            data-testid="remote-song-follow"
            className="mb-3 flex min-h-14 w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 disabled:opacity-40"
          >
            <span className="text-left">
              <span className="block text-[14px] font-medium text-white/85">Follow songs</span>
              <span className="block text-[12px] text-white/40">Start a song's show when its song plays</span>
            </span>
            <SwitchPill on={!!songs?.follow} />
          </button>
          {!songs?.shows.length && <p className="text-[13px] text-white/45" data-testid="remote-songs-empty">No song shows saved on the laptop.</p>}
          <div className="flex flex-col gap-2">
            {songs?.shows.map((show) => {
              const running = songs.runningId === show.id;
              return (
                <div
                  key={show.id}
                  data-testid={`remote-song-${show.id}`}
                  data-running={running ? 'true' : 'false'}
                  className={`${row} ${running ? 'border-live-border bg-live-bg' : 'border-white/10 bg-white/5'}`}
                >
                  <span className="flex-1 text-[15px] font-medium text-white/90">{show.title}</span>
                  {running ? (
                    <button
                      onClick={() => send({ type: 'song-stop' })}
                      disabled={!connected}
                      data-testid="remote-song-stop"
                      className="flex h-11 items-center gap-1.5 rounded-full border border-live px-4 text-[13px] font-semibold text-live disabled:opacity-40"
                    >
                      <Square size={13} fill="currentColor" /> Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => send({ type: 'song-run', id: show.id })}
                      disabled={!connected}
                      data-testid={`remote-song-run-${show.id}`}
                      className="flex h-11 items-center gap-1.5 rounded-full border border-white/15 px-4 text-[13px] font-semibold text-white/80 disabled:opacity-40"
                    >
                      <Play size={13} fill="currentColor" /> Run
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
