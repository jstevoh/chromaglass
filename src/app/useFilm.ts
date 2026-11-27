import { useState, useRef, useEffect, useCallback, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { useCameras } from '../hooks/useCameras';
import { cameraChoices, cameraPresent } from '../lib/cameras';
import type { VideoShelfProps } from '../components/VideoShelf';
import type { LoadedVideo } from './usePour';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import { cameraName, publishCameras, publishMedia, setMediaDoor, videoOpens } from './mediaNow';

/** The film's Webcam has a camera of its own, remembered apart from the motion camera's (PLAN 14ad). */
const FILM_DEVICE_KEY = 'chromaglass-film-camera';

/**
 * The film the plate can be driven by: a file, a camera or a shared window,
 * read by the film sense (`hooks/useFilmSense.ts`) and drawn through the
 * wall's engine. The camera picked is remembered by device id, and a camera
 * that goes away mid-show is said rather than silently swapped. Also the row
 * of the video loaded (PLAN 14ag), since that video can play or pour.
 */
interface FilmDeps {
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  setToast: Dispatch<SetStateAction<string | null>>;
  /** The video loaded (usePour's), and how a film file becomes it. */
  loaded: LoadedVideo | null;
  setLoaded: Dispatch<SetStateAction<LoadedVideo | null>>;
  pourName: string | null;
  pourLoaded: (v: LoadedVideo) => void;
  stopPour: () => void;
  /** usePour's `live` (PLAN 14ag-9): whether the pour is a live picture, how one is poured, and the pour's own <video> for the row's little screen. */
  live: { pourLive: boolean; pourStream: (stream: MediaStream, name: string) => void; pourVideoRef: RefObject<HTMLVideoElement | null> };
}

export function useFilm({
  wallRef, setToast, loaded, setLoaded, pourName, pourLoaded, stopPour, live: { pourLive, pourStream, pourVideoRef },
}: FilmDeps) {
  const [filmSource, setFilmSource] = useState<'none' | 'file' | 'camera' | 'window'>('none');
  /** Bumped whenever the film's picture is replaced or put down: a live pour belongs to one picture (PLAN 14ag-9). */
  const [filmEpoch, setFilmEpoch] = useState(0);
  /** The file playing as the film, by its name; read only while the film is a file. */
  const [filmName, setFilmName] = useState<string | null>(null);
  /** Play a file as the film, which becomes the video loaded. */
  const loadFilm = async (file: File) => {
    await wallRef.current?.loadFilmFile(file);
    setFilmEpoch(n => n + 1);
    setFilmSource('file');
    setFilmName(file.name);
    setFilmCameraLost(false);
    setLoaded({ file, url: null, name: file.name });
  };
  /*
    Which camera the film shows (PLAN 14ad).

    It used to be whichever one the browser called "environment", with no
    say: a second webcam, a capture card or a virtual camera (the way a VJ
    app's output arrives today, PLAN §13) could not be put on the plate. Now
    the film's picker chooses, the choice is remembered apart from the motion
    camera's (one camera usually watches the room while another looks down at
    a dish), and an unplugged camera takes the film off, says so, and puts it
    back when the same camera is plugged in again.
  */
  const cameras = useCameras();
  const [filmCameraId, setFilmCameraId] = useState<string>(() => { try { return localStorage.getItem(FILM_DEVICE_KEY) ?? ''; } catch { return ''; } });
  const filmCameraIdRef = useRef(filmCameraId);
  filmCameraIdRef.current = filmCameraId;
  /** What the film's camera opened as: its name, and whether the chosen one was missing. */
  const [filmCamera, setFilmCamera] = useState<{ label: string | null; fellBack: boolean } | null>(null);
  /** The film's camera was unplugged while it showed; it comes back when that camera does. */
  const [filmCameraLost, setFilmCameraLost] = useState(false);
  /** Null once the camera is on the plate, else why not (the assistant's answer, PLAN 44k-13). */
  const startFilmCamera = async (id: string = filmCameraIdRef.current): Promise<string | null> => {
    try {
      const got = await wallRef.current?.startFilmCamera(id, () => {
        setFilmSource('none');
        setFilmCamera(null);
        setFilmCameraLost(true);
        setToast('The film\u2019s camera was unplugged');
      });
      setFilmEpoch(n => n + 1);
      setFilmSource('camera');
      setFilmCamera(got ?? null);
      setFilmCameraLost(false);
      void cameras.refresh();
      return null;
    } catch (err) {
      console.warn('ChromaGlass: camera unavailable for the film projector.', err);
      setFilmSource('none');
      setFilmCamera(null);
      return `the camera would not open (${(err as Error)?.name ?? 'unknown'})`;
    }
  };
  const chooseFilmCamera = (id: string) => {
    setFilmCameraId(id);
    try { localStorage.setItem(FILM_DEVICE_KEY, id); } catch { /* private */ }
    // Showing a camera already: the new one takes over at once, which is
    // what choosing a camera while it is on the plate means.
    if (filmSource === 'camera') void startFilmCamera(id);
  };
  useEffect(() => {
    const id = filmCameraIdRef.current;
    const back = filmCameraLost && cameraPresent(cameras.devices, id);
    const arrived = filmSource === 'camera' && !!filmCamera?.fellBack && id !== '' && cameraPresent(cameras.devices, id);
    if (back || arrived) void startFilmCamera(id);
    // startFilmCamera is a fresh closure each render; the list is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameras.devices]);
  /*
    Film from a window.

    The projector fed by another tab, window or screen: a film off the
    Internet Archive, a media player, a slide deck. It reaches what a URL
    cannot — a cross-origin video plays in a page but cannot be read back into
    a texture on the GPU, and the Archive's own file responses carry no header that
    would allow it — because a captured window has no origin, only pixels.

    The browser's picker decides what is shared, and the cancel case is a
    deliberate no-op rather than an error: closing the picker means "not
    that", not "something went wrong".
  */
  const startFilmWindow = async (): Promise<string | null> => {
    try {
      await wallRef.current?.startFilmWindow(
        () => setFilmSource('none'),
        () => setToast('That window is coming through black — share the tab instead'),
      );
      setFilmEpoch(n => n + 1);
      setFilmSource('window');
      setFilmCameraLost(false);
      return null;
    } catch (err) {
      if ((err as DOMException)?.name === 'NotAllowedError') return 'no window was shared (the picker was closed, or sharing is not allowed)';   // picker cancelled
      console.warn('ChromaGlass: could not capture a window for the film projector.', err);
      return `no window could be shared (${(err as Error)?.message ?? 'unknown'})`;
    }
  };
  const clearFilm = () => {
    wallRef.current?.clearFilm();
    setFilmEpoch(n => n + 1);
    setFilmSource('none');
    setFilmCameraLost(false);
  };
  /** A film the show server serves by the assistant's path (PLAN 44k-13): the file's way, by address. */
  const filmUrlNow = async (url: string, name: string) => {
    await wallRef.current?.loadFilmUrl(url);
    setFilmEpoch(n => n + 1);
    setFilmSource('file');
    setFilmName(name);
    setFilmCameraLost(false);
    setLoaded({ file: null, url, name });
  };
  /** Play the video loaded, whichever door it came in by. */
  const filmLoaded = async (v: LoadedVideo) => {
    if (v.file) await loadFilm(v.file);
    else if (v.url) await filmUrlNow(v.url, v.name);
  };
  /*
    The assistant's door and copy (app/mediaNow.ts). The door reads the
    latest closures through a ref, set once while mounted; a camera chosen
    by the assistant is chosen as the picker chooses it (remembered), then
    put on the plate, and the answer waits for it to open.
  */
  const keepFilmCamera = (id: string) => { setFilmCameraId(id); try { localStorage.setItem(FILM_DEVICE_KEY, id); } catch { /* private */ } };
  const hands = { startFilmCamera, chooseFilmCamera: keepFilmCamera, startFilmWindow, clearFilm, filmUrlNow, filmLoaded, loaded };
  const live = useRef(hands);
  live.current = hands;
  useEffect(() => {
    setMediaDoor('film', {
      file: async (url, name) => {
        if (!wallRef.current) return 'the plate is not running';
        const why = await videoOpens(url);
        if (!why) await live.current.filmUrlNow(url, name);
        return why;
      },
      loaded: async () => {
        const v = live.current.loaded;
        if (!v) return 'no video is loaded (load one with film or pour_file first)';
        if (!wallRef.current) return 'the plate is not running';
        await live.current.filmLoaded(v);
        return null;
      },
      camera: async (id) => { if (id !== undefined) live.current.chooseFilmCamera(id); return live.current.startFilmCamera(id); },
      window: () => live.current.startFilmWindow(),
      clear: () => live.current.clearFilm(),
    });
    return () => setMediaDoor('film', null);
  }, []);
  const camList = cameraChoices(cameras.devices);
  const camKey = camList.map(c => `${c.id}\n${c.label}`).join('\n');
  useEffect(() => { publishCameras(camList); }, [camKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    publishMedia({ film: {
      source: filmSource, name: filmSource === 'file' ? filmName : null,
      camera: filmSource === 'camera' ? filmCamera?.label ?? cameraName(filmCameraId) : null, cameraLost: filmCameraLost,
    } });
  }, [filmSource, filmName, filmCamera, filmCameraId, filmCameraLost, camKey]);
  /*
    A live pour ends with the live picture it copies (PLAN 14ag-9): the pour
    holds a clone of the film's stream, so it would go on reading a camera the
    Video panel says is off. Taken off with the film, a swap to a file or
    another camera or window included (keyed on each picture the film is
    given, not its name: two windows share one, and an unnamed camera has
    none); the new source is poured afresh by pressing Pour. A camera
    unplugged mid-show takes the film off without clearFilm, so its going
    to 'none' is in the key too.
  */
  /** The row's little screen: the film's own picture, else the pour's (a file pouring with nothing on the plate). */
  const pourOnRef = useRef(false);
  pourOnRef.current = pourName !== null;
  const filmPreview = useCallback(() => wallRef.current?.filmVideoEl() ?? (pourOnRef.current ? pourVideoRef.current : null), [wallRef, pourVideoRef]);
  const liveKey = `${filmEpoch} ${filmSource}`;
  const pourLiveRef = useRef(pourLive);
  pourLiveRef.current = pourLive;
  const pourKeyRef = useRef('');
  useEffect(() => {
    if (pourLiveRef.current && pourKeyRef.current !== liveKey) stopPour();
    // stopPour is stable (usePour's useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);
  const liveName = filmSource === 'camera' ? (filmCamera?.label || 'Camera') : filmSource === 'window' ? 'A shared window' : null;
  /*
    The row of the video coming in (components/VideoShelf.tsx), on the Video
    panel, the Dyes panel and the phone's dye sheet. It is the input on the
    plate: the camera or the window while one is on, else the file loaded
    (every file film is the video loaded: a file played becomes it). It used
    to be the file's alone, so with the camera on it named a file that was not
    playing, Play unlit, and the camera had no Pour (the owner, 2026-11-27:
    "hard to understand and control what is on screen").
  */
  const video: VideoShelfProps = liveName ? {
    name: liveName,
    kind: filmSource === 'camera' ? 'camera' : 'window',
    filming: true,
    // Lit only while this picture pours; a file still pouring from before is said, and Pour swaps to the camera.
    pouring: pourName !== null && pourLive,
    pourName: pourLive ? null : pourName,
    onFilm: () => clearFilm(),
    onPour: () => {
      if (pourName !== null && pourLive) { stopPour(); return; }
      const s = wallRef.current?.filmVideoEl()?.srcObject;
      if (s instanceof MediaStream) { pourKeyRef.current = liveKey; pourStream(s, liveName); }
    },
    preview: filmPreview,
  } : {
    name: loaded?.name ?? null,
    kind: 'file',
    filming: filmSource === 'file',
    pouring: pourName !== null,
    onFilm: () => { if (filmSource === 'file') clearFilm(); else if (loaded) void filmLoaded(loaded); },
    onPour: () => { if (pourName !== null) stopPour(); else if (loaded) pourLoaded(loaded); },
    preview: filmPreview,
  };

  return {
    filmSource, filmName, loadFilm, cameras, filmCameraId, filmCamera, filmCameraLost,
    startFilmCamera, chooseFilmCamera, startFilmWindow, clearFilm, video,
  };
}
