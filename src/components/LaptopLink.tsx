import { useState } from 'react';
import { Droplets, Laptop } from 'lucide-react';
import { LOCKUP_URL } from '../brand';
import { goPlay, parseLaptopAddress, remoteHref, saveLaptop, savedLaptop, type LaptopLink as Link } from '../lib/appLink';

/**
 * The iPhone app asking which laptop to be a remote for (`lib/appLink.ts`).
 *
 * One field, filled the way a person actually has the address: pasted from
 * what `npm run remote` printed on the laptop, key and all, or typed as the
 * laptop's address. The key has its own field because it is the part people
 * read off a screen across the room. The last laptop is filled in, so a
 * second show on the same rig is one tap.
 */
export function LaptopLinkForm() {
  const saved = savedLaptop();
  const [address, setAddress] = useState(saved?.relay ?? '');
  const [key, setKey] = useState(saved?.key ?? '');
  const [error, setError] = useState<string | null>(null);

  const connect = () => {
    const link: Link | null = parseLaptopAddress(address, key);
    if (!link) {
      setError('That is not an address. Paste the Phone line the show server printed, or type the laptop\'s address.');
      return;
    }
    saveLaptop(link);
    window.location.href = remoteHref(link);
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); connect(); }}
      className="min-h-screen bg-[#0a0a0a] px-5 text-white"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      data-testid="laptop-link"
    >
      <img src={LOCKUP_URL} alt="ChromaGlass" className="block h-8 w-auto" draggable={false} />
      <h1 className="mt-6 flex items-center gap-2 text-[15px] font-semibold"><Laptop size={18} /> Be the laptop's remote</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-white/55">
        On the laptop, run the show server (<span className="font-mono">npm run remote</span>). Paste the Phone
        address it prints here, or type the laptop's address. The phone and the laptop must be on the same Wi-Fi.
      </p>

      <label className="mt-5 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/60" htmlFor="laptop-address">Laptop address</label>
      <input
        id="laptop-address"
        value={address}
        onChange={(e) => {
          // A pasted Phone line carries the key the server printed this time;
          // it replaces the remembered one, which the server has since
          // changed unless SHOW_KEY pins it (server/remote-server.js).
          const text = e.target.value;
          setAddress(text);
          const pasted = parseLaptopAddress(text);
          if (pasted?.key) setKey(pasted.key);
          setError(null);
        }}
        placeholder="http://192.168.1.20:3000/?remote=1&key=1234"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-3 font-mono text-[16px] text-white placeholder:text-white/25"
        data-testid="laptop-address"
      />
      <label className="mt-4 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/60" htmlFor="laptop-key">Show key</label>
      <input
        id="laptop-key"
        value={key}
        onChange={(e) => { setKey(e.target.value); setError(null); }}
        placeholder="1234"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-3 font-mono text-[16px] text-white placeholder:text-white/25"
        data-testid="laptop-key"
      />
      {error && <p className="mt-3 text-[13px] text-red-300" data-testid="laptop-error">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button type="submit" className="flex-1 rounded-full bg-white px-4 py-3 text-[13px] font-bold uppercase tracking-widest text-black" data-testid="laptop-connect">
          Connect
        </button>
        <button type="button" onClick={goPlay} className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-3 text-[13px] font-bold uppercase tracking-widest text-white/80" data-testid="app-play-here">
          <Droplets size={15} /> Play here
        </button>
      </div>
    </form>
  );
}

/**
 * The app's two modes, from inside the remote: back to playing the show on
 * the phone, or pointed at a different laptop. Shown only in the app; the
 * remote the laptop serves to a browser has nowhere else to go.
 */
export function AppModeBar() {
  return (
    <div className="flex items-center justify-end gap-2 border-b border-white/10 px-5 py-2" data-testid="app-mode-bar">
      <a href="/?remote=1" className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/60" data-testid="app-change-laptop">
        Change laptop
      </a>
      <button onClick={goPlay} className="flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/90" data-testid="app-play-here">
        <Droplets size={12} /> Play here
      </button>
    </div>
  );
}
