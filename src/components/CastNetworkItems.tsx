import { Info } from './Info';
import type { RelayInfo } from '../lib/remoteProtocol';

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
export function CastNetworkItems({ relay, mirrorCount, tvCount }: { relay: RelayInfo | null; mirrorCount: number; tvCount: number }) {
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
