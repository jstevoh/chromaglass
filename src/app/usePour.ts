import React, { useRef, useCallback, useState, type RefObject } from 'react';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';

/**
 * Pouring a picture or a film into the dish: an image laid as dye, a video
 * (a file, or a cartoon from the shelf) poured frame by frame. The film that
 * drives the plate rather than pouring into it is `useFilm`, which stops a pour
 * before it starts.
 */
interface PourDeps {
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
}

export function usePour({
  visualizerRef,
}: PourDeps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      // Draw image to an offscreen canvas to get pixel data
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // The plate's rows run from the bottom of the frame up; a canvas's run down, and
      // `injectImage` lays the rows it is given on the plate's as they come (as the
      // text pour's canvas is turned before it, `pourText`). Drawn upside down here,
      // the picture lands the right way up (PLAN 14ab-13: it landed upside down).
      ctx.translate(0, img.height);
      ctx.scale(1, -1);
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      visualizerRef.current?.injectImage(imageData);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, []);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  /** A poured file's object URL, revoked when the pour moves on. */
  const pourUrlRef = useRef<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  /** The shelf's cartoon pouring as dye (lib/cartoons.ts), or null for a file or nothing. */
  const [pouringCartoon, setPouringCartoon] = useState<string | null>(null);
  /** The file pouring as dye, by its name, so a row that poured it can say it is (Settings' demo loops). */
  const [pourName, setPourName] = useState<string | null>(null);
  /*
    The video pour: one hidden, muted, looping <video>, handed to the plate
    once when it starts playing. It used to be handed over again on every
    animation frame, which made the plate pause and play it every frame
    (PLAN 14ab-1, fixed in `pourVideo`); the plate's own frame loop reads the
    picture, so once is enough. A cartoon is given by address, so it pours
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
    setPouringCartoon(null);
    setPourName(null);
  }, []);
  const pourFile = useCallback((file: File) => {
    pourVideoFrom(URL.createObjectURL(file), true);
    setPouringCartoon(null);
    setPourName(file.name);
  }, [pourVideoFrom]);
  const handleVideoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) pourFile(file);
    e.target.value = '';
  }, [pourFile]);

  return {
    fileInputRef, handleImageUpload, videoInputRef, videoPlayerRef, isVideoPlaying, pouringCartoon,
    setPouringCartoon, pourName, setPourName, pourVideoFrom, stopPour, pourFile, handleVideoUpload,
  };
}
