import { useState, useRef, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { useCameras } from '../hooks/useCameras';
import { cameraChoices, cameraPresent } from '../lib/cameras';
import { CARTOON_BY_ID } from '../lib/cartoons';
import type { CartoonShelfProps } from '../components/CartoonShelf';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import { cameraName, publishCameras, publishMedia, setMediaDoor } from './mediaNow';

/** The film's Webcam has a camera of its own, remembered apart from the motion camera's (PLAN 14ad). */
const FILM_DEVICE_KEY = 'chromaglass-film-camera';

/**
 * The film the plate can be driven by: a file, a cartoon off the shelf, a
 * camera or a shared window, read by the film sense (`hooks/useFilmSense.ts`)
 * and drawn through the wall's engine. The camera picked is remembered by
 * device id, and a camera that goes away mid-show is said rather than silently
 * swapped. Also the cartoon shelf's state, since a cartoon can pour or film.
 */
interface FilmDeps {
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  setToast: Dispatch<SetStateAction<string | null>>;
  pouringCartoon: string | null;
  pourVideoFrom: (src: string, objectUrl: boolean) => void;
  setPouringCartoon: Dispatch<SetStateAction<string | null>>;
  setPourName: Dispatch<SetStateAction<string | null>>;
  stopPour: () => void;
}

export function useFilm({
  wallRef, setToast, pouringCartoon, pourVideoFrom, setPouringCartoon, setPourName, stopPour,
}: FilmDeps) {
  const [filmSource, setFilmSource] = useState<'none' | 'file' | 'camera' | 'window'>('none');
  /** The shelf's cartoon playing as the film; read only while the film is a file (a camera or window replaces it). */
  const [filmCartoon, setFilmCartoon] = useState<string | null>(null);
  /** The file playing as the film, by its name; read only while the film is a file. */
  const [filmName, setFilmName] = useState<string | null>(null);
  const loadFilm = async (file: File) => {
    await wallRef.current?.loadFilmFile(file);
    setFilmSource('file');
    setFilmCartoon(null);
    setFilmName(file.name);
    setFilmCameraLost(false);
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
      setFilmSource('camera');
      setFilmCartoon(null);
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
    setFilmSource('none');
    setFilmCartoon(null);
    setFilmCameraLost(false);
  };
  const filmCartoonNow = async (id: string) => {
    const c = CARTOON_BY_ID.get(id);
    if (!c) return;
    await wallRef.current?.loadFilmUrl(c.src);
    setFilmSource('file');
    setFilmCartoon(id);
    setFilmName(c.title);
    setFilmCameraLost(false);
  };
  /** A film the show server serves by the assistant's path (PLAN 44k-13): the file's way, by address. */
  const filmUrlNow = async (url: string, name: string) => {
    await wallRef.current?.loadFilmUrl(url);
    setFilmSource('file');
    setFilmCartoon(null);
    setFilmName(name);
    setFilmCameraLost(false);
  };
  /** The cartoon shelf's state and hands (desk, Settings, phone). */
  const filmingCartoon = filmSource === 'file' ? filmCartoon : null;
  /*
    The assistant's door and copy (app/mediaNow.ts). The door reads the
    latest closures through a ref, set once while mounted; a camera chosen
    by the assistant is chosen as the picker chooses it (remembered), then
    put on the plate, and the answer waits for it to open.
  */
  const keepFilmCamera = (id: string) => { setFilmCameraId(id); try { localStorage.setItem(FILM_DEVICE_KEY, id); } catch { /* private */ } };
  const hands = { startFilmCamera, chooseFilmCamera: keepFilmCamera, startFilmWindow, clearFilm, filmUrlNow, filmCartoonNow };
  const live = useRef(hands);
  live.current = hands;
  useEffect(() => {
    setMediaDoor('film', {
      file: async (url, name) => { await live.current.filmUrlNow(url, name); return null; },
      cartoon: async (id) => { await live.current.filmCartoonNow(id); return null; },
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
      source: filmSource, name: filmSource === 'file' ? filmName : null, cartoon: filmingCartoon,
      camera: filmSource === 'camera' ? filmCamera?.label ?? cameraName(filmCameraId) : null, cameraLost: filmCameraLost,
    } });
  }, [filmSource, filmName, filmingCartoon, filmCamera, filmCameraId, filmCameraLost, camKey]);
  const cartoons: CartoonShelfProps = {
    pouring: pouringCartoon,
    filming: filmingCartoon,
    onPour: (id) => {
      const c = CARTOON_BY_ID.get(id);
      if (!c) return;
      pourVideoFrom(c.src, false);
      setPouringCartoon(id);
      setPourName(c.title);
    },
    onFilm: (id) => { if (filmingCartoon === id) clearFilm(); else void filmCartoonNow(id); },
    onStopPour: stopPour,
  };

  return {
    filmSource, filmName, loadFilm, cameras, filmCameraId, filmCamera, filmCameraLost,
    startFilmCamera, chooseFilmCamera, startFilmWindow, clearFilm, cartoons,
  };
}
