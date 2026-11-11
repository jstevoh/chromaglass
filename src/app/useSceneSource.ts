import { useState, useRef, useCallback, useEffect } from 'react';
import { useSceneCamera } from '../hooks/useSceneCamera';
import type { VisualizerSettings } from '../types';
import type { useCameras } from '../hooks/useCameras';
import { SCENE_ON_KEY } from './shared';
import { cameraName, publishMedia, setMediaDoor } from './mediaNow';

const SCENE_DEVICE_KEY = 'chromaglass-scene-device';

/**
 * The room camera as a sensor (`hooks/useSceneCamera.ts`): it stirs the plate,
 * puts hands on it and rides the settings its mappings name. Off on every load,
 * whatever last time said; Resume is an offer, not a switch.
 */
interface SceneSourceDeps {
  cameras: ReturnType<typeof useCameras>;
  settings: VisualizerSettings;
}

export function useSceneSource({
  cameras, settings,
}: SceneSourceDeps) {
  // ── The room ────────────────────────────────────────────────────
  // The camera as a sensor: it stirs the plate, puts hands on it and rides
  // whatever settings the mappings name. Off unless someone switched it on.
  /*
    Off on every load, whatever last time said.

    This used to restore straight from `localStorage`, so a camera switched on
    once came back on by itself at every load from then on — and because the
    browser had already granted permission there was no prompt either. The
    light came on in a room with nothing on screen saying why. A remembered
    switch is an offer, not an instruction.
  */
  const [sceneOn, setSceneOn] = useState<boolean>(false);
  /** It was on when they left, so the app offers it back rather than taking it. */
  const [sceneResume, setSceneResume] = useState<boolean>(() => {
    try { return localStorage.getItem(SCENE_ON_KEY) === '1'; } catch { return false; }
  });
  const [sceneDeviceId, setSceneDeviceId] = useState<string>(() => { try { return localStorage.getItem(SCENE_DEVICE_KEY) ?? ''; } catch { return ''; } });
  const scenePreviewRef = useRef<HTMLCanvasElement | null>(null);
  /** True once the camera has been switched on by hand in this session. */
  const sceneAskedRef = useRef(false);
  const toggleScene = useCallback((on: boolean) => {
    if (on) sceneAskedRef.current = true;
    setSceneResume(false);
    setSceneOn(on);
    try { localStorage.setItem(SCENE_ON_KEY, on ? '1' : '0'); } catch { /* private */ }
  }, []);
  const chooseSceneDevice = useCallback((id: string) => {
    setSceneDeviceId(id);
    try { localStorage.setItem(SCENE_DEVICE_KEY, id); } catch { /* private */ }
  }, []);
  const scene = useSceneCamera({
    enabled: sceneOn,
    userAsked: sceneAskedRef.current,
    deviceId: sceneDeviceId,
    cameras: cameras.devices,
    onOpened: cameras.refresh,
    mirror: settings.sceneMirror !== false,
    deadzone: settings.sceneDeadzone ?? 0.25,
    smooth: settings.sceneSmooth ?? 0.35,
    people: settings.scenePeople !== false,
    preview: scenePreviewRef,
  });

  /*
    The assistant's door and copy (app/mediaNow.ts): a camera chosen as the
    picker chooses it, then the switch as the Settings switch throws it, so
    an assistant's "on" counts as asked by hand (the prompt, the light).
  */
  const sceneState = useRef(scene.state);
  sceneState.current = scene.state;
  useEffect(() => {
    setMediaDoor('room', {
      set: (on, id) => {
        if (id !== undefined) chooseSceneDevice(id);
        toggleScene(on);
        if (!on) return null;
        // The answer waits for the camera (a denied permission or an unplugged
        // one only shows when getUserMedia answers), up to eight seconds.
        return new Promise((done) => {
          const t0 = Date.now();
          const look = () => {
            const st = sceneState.current;
            if (st.active) done(null);
            else if (st.error && Date.now() - t0 > 300) done(`the room camera did not open: ${st.error}`);
            else if (Date.now() - t0 > 8000) done('the room camera did not open within eight seconds');
            else setTimeout(look, 100);
          };
          setTimeout(look, 100);
        });
      },
    });
    return () => setMediaDoor('room', null);
  }, [chooseSceneDevice, toggleScene]);
  const camKey = cameras.devices.map(d => `${d.deviceId}\n${d.label}`).join('\n');
  useEffect(() => { publishMedia({ room: { on: sceneOn, camera: cameraName(sceneDeviceId), resume: sceneResume } }); }, [sceneOn, sceneDeviceId, sceneResume, camKey]);

  return {
    sceneOn, sceneResume, setSceneResume, sceneDeviceId, scenePreviewRef, toggleScene,
    chooseSceneDevice, scene,
  };
}
