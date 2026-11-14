import { Info } from './Info';
import type { RelayInfo } from '../lib/remoteProtocol';

/**
 * The Cast menu's network display addresses (PLAN 14m-https).
 *
 * A browser runs WebGPU only on a secure page: https, or the machine's own
 * localhost. A projector, a TV or a second computer is another machine, so the
 * http Wi-Fi address this menu used to show could never start the plate there
 * ("GPUTextureUsage is not defined"). The show server now serves the same page
 * and relay over https on `relay.httpsPort` with a certificate it makes on its
 * first launch, and this list gives that address; the display's browser warns
 * once that the certificate is its own, and once that is accepted the page is
 * a secure context with the GPU. When the server has no https (no openssl to
 * make a certificate, the port taken, or HTTPS_PORT=0) the http address is
 * still shown, with the reason to look at the server's window, rather than an
 * address that does not answer.
 *
 * It lives beside App.tsx, not in it, because App.tsx is over the size budget
 * and may not grow (`npm run sizes`).
 */
export function NetworkDisplayAddresses({ relay }: { relay: RelayInfo }) {
  const keyPart = relay.key ? `&key=${relay.key}` : '';
  return (
    <>
      <div className="text-[11px] opacity-50 leading-snug mt-0.5">Any browser on the same Wi-Fi:</div>
      {(relay.hosts.length ? relay.hosts : [window.location.hostname]).map((lanHost) => (
        <div key={lanHost} className="font-mono text-[11px] text-white/80 select-all mt-1" data-testid="cast-network-address">{relay.httpsPort ? `https://${lanHost}:${relay.httpsPort}` : `http://${lanHost}:${relay.port}`}/?cast=true{keyPart}</div>
      ))}
      {!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) && !relay.hosts.includes(window.location.hostname) && (
        <div className="font-mono text-[11px] text-white/80 select-all mt-1">{window.location.origin}/?cast=true{keyPart}</div>
      )}
      <div className="mt-2">
        <Info label="">
          Open one of these on a projector, a TV or a tablet and it shows the
          show.{relay.httpsPort ? ' Its browser warns once that the connection is not private: choose Advanced, then Proceed.' : ' This show server has no https, and a display needs it to start: see the server\'s window.'} Across buildings or other access points: run{' '}
          <span className="font-mono">npm run tunnel</span> and use the https
          address it prints, with the same{' '}
          <span className="font-mono">?cast=true&amp;key=…</span>.
        </Info>
      </div>
    </>
  );
}
