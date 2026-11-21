import React, { useRef, useCallback, useState, useEffect, type RefObject } from 'react';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import { uprightPicture } from '../lib/videoFlow';
import { publishMedia, setMediaDoor, videoOpens } from './mediaNow';

/**
 * Pouring a picture or a film into the dish: an image laid as dye, a video
 * poured frame by frame. The film that drives the plate rather than pouring
 * into it is `useFilm`.
 *
 * Also the one video loaded (PLAN 14ag), which both panels share: a file
 * chosen here to pour, or in the Video panel to play, is the same `loaded`,
 * and the row under it (components/VideoShelf.tsx) plays and pours it. It
 * lives here rather than in useFilm because this hook runs first and useFilm
 * is handed what it returns.
 */
export interface LoadedVideo {
  /** The file itself, when one was chosen on this machine. */
  file: File | null;
  /** Else the address it is served from (the assistant's, app/mediaNow.ts). */
  url: string | null;
  name: string;
}

interface PourDeps {
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
}

export function usePour({
  visualizerRef,
}: PourDeps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** A picture laid as dye from an address: null once laid, else why not (the assistant's answer, PLAN 44k-13). */
  const pourImageFrom = useCallback((src: string) => new Promise<string | null>((done) => {
    if (!visualizerRef.current) { done('the plate is not running'); return; }
    const img = new Image();
    img.onload = () => {
      // Its pixels turned over for the plate, whose rows count up (PLAN 14ab-13).
      const imageData = uprightPicture(img, img.width, img.height);
      if (imageData) visualizerRef.current?.injectImage(imageData);
      done(imageData ? null : 'that picture could not be read');
    };
    img.onerror = () => done('that file would not open as a picture');
    img.src = src;
  }), []);
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    void pourImageFrom(url).then(() => URL.revokeObjectURL(url));
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, [pourImageFrom]);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  /** A poured file's object URL, revoked when the pour moves on. */
  const pourUrlRef = useRef<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  /** The video pouring as dye, by its name, or null: what the row lights its Pour by. */
  const [pourName, setPourName] = useState<string | null>(null);
  /** The video loaded, by either door, or null before one is. */
  const [loaded, setLoaded] = useState<LoadedVideo | null>(null);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  /*
    The video pour: one hidden, muted, looping <video>, handed to the plate
    once when it starts playing. It used to be handed over again on every
    animation frame, which made the plate pause and play it every frame
    (PLAN 14ab-1, fixed in `pourVideo`); the plate's own frame loop reads the
    picture, so once is enough. A served video is given by address, so it pours
    while it is still arriving; a file by an object URL.
  */
  const pourVideoFrom = useCallback((src: string, objectUrl: boolean) => {
    const v = videoPlayerRef.current;
    if (!v) return;
    if (pourUrlRef.current) URL.revokeObjectURL(pourUrlRef.current);
    pourUrlRef.current = objectUrl ? src : null;
    v.onplay = () => { setIsVideoPlaying(true); visualizerRef.current?.pourVideo(v); };
    v.onpause = () => setIsVideoPlaying(false);
    v.onended = () => setIsVideoPlaying(false);
    v.src = src;
    v.play().catch(() => { /* autoplay policy: plays on the next gesture */ });
  }, []);
  const stopPour = useCallback(() => {
    visualizerRef.current?.stopPourVideo();
    const v = videoPlayerRef.current;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    if (pourUrlRef.current) { URL.revokeObjectURL(pourUrlRef.current); pourUrlRef.current = null; }
    setIsVideoPlaying(false);
    setPourName(null);
  }, []);
  /** Pour a file, which becomes the video loaded. */
  const pourFile = useCallback((file: File) => {
    pourVideoFrom(URL.createObjectURL(file), true);
    setPourName(file.name);
    setLoaded({ file, url: null, name: file.name });
  }, [pourVideoFrom]);
  /** Pour the video loaded, whichever door it came in by: a file afresh, a served one by its address. */
  const pourLoaded = useCallback((v: LoadedVideo) => {
    if (v.file) pourFile(v.file);
    else if (v.url) { pourVideoFrom(v.url, false); setPourName(v.name); }
  }, [pourFile, pourVideoFrom]);
  const handleVideoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) pourFile(file);
    e.target.value = '';
  }, [pourFile]);

  /*
    The assistant's door and copy (app/mediaNow.ts): the Pour panel's own
    calls, and the video loaded poured as its row pours it. The door reads
    the latest loaded through a ref, so it is set once.
  */
  useEffect(() => {
    setMediaDoor('pour', {
      image: pourImageFrom,
      video: async (url, name) => {
        if (!videoPlayerRef.current || !visualizerRef.current) return 'the plate is not running';
        const why = await videoOpens(url);
        if (!why) { pourVideoFrom(url, false); setPourName(name); setLoaded({ file: null, url, name }); }
        return why;
      },
      loaded: () => {
        const v = loadedRef.current;
        if (!v) return 'no video is loaded (load one with film or pour_file first)';
        if (!videoPlayerRef.current || !visualizerRef.current) return 'the plate is not running';
        pourLoaded(v);
        return null;
      },
      stop: stopPour,
    });
    return () => setMediaDoor('pour', null);
  }, [pourImageFrom, pourVideoFrom, pourLoaded, stopPour]);
  useEffect(() => { publishMedia({ pour: { playing: isVideoPlaying, name: pourName }, video: loaded?.name ?? null }); }, [isVideoPlaying, pourName, loaded]);

  return {
    fileInputRef, handleImageUpload, videoInputRef, videoPlayerRef, isVideoPlaying,
    pourName, pourVideoFrom, stopPour, pourFile, pourLoaded, handleVideoUpload, loaded, setLoaded,
  };
}
