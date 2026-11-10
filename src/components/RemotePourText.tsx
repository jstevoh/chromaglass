import { useState } from 'react';
import { Type } from 'lucide-react';
import type { RemoteMessage } from '../lib/remoteProtocol';
import { pourTextRows } from '../lib/pourText';
import { LIT } from './ui';

/**
 * Pour words on the remote (PLAN 37x-10c): type or paste a song's name and
 * credit, press Pour, and the laptop pours them onto the plate as ink, where
 * the liquid carries them off. The first line is the name, each line after it
 * a credit; "Song - Artist" on one line is read as both (`pourTextRows`).
 *
 * Its own file because `RemoteControl.tsx` is past 40 KB. The box is the
 * phone's half of a live set's title cards: the desk pours a title only for
 * a song music intelligence named, and a set played from files names
 * nothing, so the performer holding the phone names it. When the laptop has
 * named the song, one tap fills the box with it.
 *
 * The text is cleared once poured: the next song needs its own, and a box
 * still holding the last title is one tap from pouring it twice.
 */
export function RemotePourText({ send, connected, trackName }: {
  send: (m: RemoteMessage) => void;
  connected: boolean;
  trackName?: string | null;
}) {
  const [text, setText] = useState('');
  const rows = pourTextRows(text);
  const pour = () => {
    if (rows.length === 0) return;
    send({ type: 'pour-text', rows, colour: 'contrast' });
    setText('');
  };
  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4" data-testid="remote-pour-text">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
          <Type size={15} /> Pour words
        </span>
        {trackName && (
          <button
            onClick={() => setText(trackName)}
            disabled={!connected}
            className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/60 disabled:opacity-30"
            data-testid="remote-pour-text-track"
          >
            This song
          </button>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder={'Song name\nArtist'}
        aria-label="Words to pour: the first line is the song, the next the credit"
        className="mb-3 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-base text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none"
        data-testid="remote-pour-text-input"
      />
      <button
        onClick={pour}
        disabled={!connected || rows.length === 0}
        className={`flex min-h-12 w-full items-center justify-center rounded-2xl border text-[11px] font-bold uppercase tracking-[0.2em] transition-colors active:scale-95 disabled:opacity-30 ${LIT}`}
        data-testid="remote-pour-text-go"
      >
        {rows.length ? `Pour ${rows.map((r) => r.text).join(' / ').slice(0, 40)}` : 'Pour'}
      </button>
    </div>
  );
}
