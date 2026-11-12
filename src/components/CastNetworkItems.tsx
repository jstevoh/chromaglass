import { Info } from './Info';
import type { RelayInfo, RemoteMessage } from '../lib/remoteProtocol';

/**
 * The cast menu's two network entries: a network display, which runs its own
 * plate from the show's settings (`?cast=true`), and a TV at home, which plays
 * this plate as video (`/tv`, PLAN 12-tv, lib/tvFeed.ts). Moved out of
 * App.tsx whole when the TV's entry joined it, so App did not grow.
 *
 * Why two and not one: a network display needs a GPU that can run the solver
 * (another laptop, a good tablet) and costs this machine nothing; a TV needs
 * none (a TV box, a phone) and costs this machine an encode. The addresses are
 * the ones a person types, so they stay as text that can be selected.
 */
/**
 * The TVs at home as the laptop's page sees them (app/useRemote.ts): how many
 * watch, which ask to pair by four digits and how many hold a key (PLAN
 * 12-tv-2, server/tv-pairing.js), and the three answers the laptop can give.
 */
export interface TvAtHome {
  count: number;
  asks: { id: string; code: string }[];
  paired: number;
  allow: (id: string) => void;
  refuse: (id: string) => void;
  forget: () => void;
}

/**
 * The laptop's three answers as the relay's messages (PLAN 12-tv-2), out of
 * the hook so the check can hold the exact messages a press sends.
 */
export function tvAtHome(count: number, pairing: { asks: { id: string; code: string }[]; paired: number }, send: (m: RemoteMessage) => void): TvAtHome {
  return {
    count,
    asks: pairing.asks,
    paired: pairing.paired,
    allow: (id) => send({ type: 'tv-allow', id }),
    refuse: (id) => send({ type: 'tv-refuse', id }),
    forget: () => send({ type: 'tv-forget' }),
  };
}

const BUTTON = 'rounded-full px-3 py-1 text-[11px] font-semibold';

/** One TV asking: its digits, Allow and No. The same row in the card and the cast menu. */
function TvAsk({ ask, tv }: { ask: { id: string; code: string }; tv: TvAtHome }) {
  return (
    <div className="flex items-center gap-2" data-testid="tv-ask" data-code={ask.code}>
      <span className="text-[12px]">A TV wants to join:</span>
      <span className="font-mono text-[14px] font-semibold tracking-widest">{ask.code}</span>
      <button type="button" className={`${BUTTON} bg-white text-black ml-auto`} data-testid="tv-allow" onClick={() => tv.allow(ask.id)}>Allow</button>
      <button type="button" className={`${BUTTON} bg-white/10 text-white/80`} data-testid="tv-refuse" onClick={() => tv.refuse(ask.id)}>No</button>
    </div>
  );
}

/**
 * The card a TV's ask raises at the top of the laptop's screen, cast menu
 * open or not (PLAN 12-tv-2): the person who just turned the TV on is looking
 * at both, and a menu nobody has opened would leave the TV waiting. It goes
 * when answered, or after the relay's two minutes.
 */
export function TvAsks({ tv }: { tv: TvAtHome }) {
  if (tv.asks.length === 0) return null;
  return (
    <div className="fixed top-14 left-1/2 z-50 -translate-x-1/2 w-[min(92vw,380px)] space-y-2 rounded-2xl border border-white/15 bg-black/80 px-4 py-3 text-white backdrop-blur-xl" data-testid="tv-asks">
      {tv.asks.map((a) => <TvAsk key={a.id} ask={a} tv={tv} />)}
      <div className="text-[11px] opacity-50 leading-snug">Allow it if these digits are the ones on your TV.</div>
    </div>
  );
}

export function CastNetworkItems({ relay, mirrorCount, tv }: { relay: RelayInfo | null; mirrorCount: number; tv: TvAtHome }) {
  const tvCount = tv.count;
  const hosts = relay ? (relay.hosts.length ? relay.hosts : [window.location.hostname]) : [];
  return (
    <>
      <div className="px-3 py-2.5 rounded-lg" data-testid="cast-network">
        <div className="text-xs font-semibold">Network display{mirrorCount > 0 ? ` · ${mirrorCount} connected` : ''}</div>
        {relay ? (
          <>
            <div className="text-[11px] opacity-50 leading-snug mt-0.5">Any browser on the same Wi-Fi:</div>
            {(relay.hosts.length ? relay.hosts : [window.location.hostname]).map((h) => (
              <div key={h} className="font-mono text-[11px] text-white/80 select-all mt-1">http://{h}:{relay.port}/?cast=true{relay.key ? `&key=${relay.key}` : ''}</div>
            ))}
            {!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) && !relay.hosts.includes(window.location.hostname) && (
              <div className="font-mono text-[11px] text-white/80 select-all mt-1">{window.location.origin}/?cast=true{relay.key ? `&key=${relay.key}` : ''}</div>
            )}
            <div className="mt-2">
              <Info label="">
                Open one of these on a projector, a TV or a tablet and it shows the
                show. Across buildings or other access points: run{' '}
                <span className="font-mono">npm run tunnel</span> and use the https
                address it prints, with the same{' '}
                <span className="font-mono">?cast=true&amp;key=…</span>.
              </Info>
            </div>
          </>
        ) : (
          <div className="text-[11px] opacity-50 leading-snug mt-0.5">
            Needs the show server: run <span className="font-mono">npm run remote</span>.
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 rounded-lg" data-testid="cast-tv">
        <div className="text-xs font-semibold">TV at home{tvCount > 0 ? ` · ${tvCount} watching` : ''}</div>
        {relay ? (
          <>
            <div className="text-[11px] opacity-50 leading-snug mt-0.5">A TV, phone or tablet on the same network:</div>
            {hosts.map((h) => (
              <div key={h} className="font-mono text-[11px] text-white/80 select-all mt-1" data-testid="cast-tv-address">http://{h}:{relay.port}/tv{relay.key ? `?key=${relay.key}` : ''}</div>
            ))}
            {tv.asks.map((a) => <div key={a.id} className="mt-2"><TvAsk ask={a} tv={tv} /></div>)}
            <div className="mt-2">
              <Info label="">
                The ChromaGlass app for Android TV and Google TV finds this computer by itself:
                the TV shows four digits, and Allow here lets it in for good.
              </Info>
            </div>
            {tv.paired > 0 && (
              <button type="button" className={`${BUTTON} mt-2 bg-white/10 text-white/80`} data-testid="tv-forget" onClick={tv.forget}>
                Forget {tv.paired === 1 ? 'the paired TV' : `${tv.paired} paired TVs`}
              </button>
            )}
            <div className="mt-2">
              <Info label="">
                Plays this very plate on the TV as video, sent over your home network, so the
                TV needs no graphics power of its own. Open the address in the TV's browser or
                on a phone or tablet. When the show is off the TV plays films until it starts.
                Needs ChromaGlass Home or Pro on this computer; up to three TVs at once.
              </Info>
            </div>
          </>
        ) : (
          <div className="text-[11px] opacity-50 leading-snug mt-0.5">
            Needs the show server: open the Mac app, or run <span className="font-mono">npm run remote</span>.
          </div>
        )}
      </div>
    </>
  );
}
