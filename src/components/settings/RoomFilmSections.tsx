import { Wind, Camera, Film, Video, MonitorPlay, ScanEye } from 'lucide-react';
import { groupOf } from '../../lib/settingsMap';
import { Info } from '../Info';
import { Toggle, LIT } from '../ui';
import { CameraPicker } from '../CameraPicker';
import { FilmShelves } from '../FilmShelves';
import { Slider } from './controls';
import type { SectionCtx } from './props';

/*
  Feed: the two pictures a show can be driven by, the motion camera and the film.

  Each section is the markup that sat inline in `SettingsPanel`'s `sections` tree,
  moved verbatim (PLAN 19ai-9): its `{keep(id) && (<section ...>)}` is unchanged, so
  a desk panel, the Stage sheet and the full sheet draw it exactly as before, and
  it takes the panel's props and locals as one object (`SectionCtx`, in
  `props.ts`), destructuring only the names its markup reads. `npm run panel`
  reads this file with the panel (`scripts/settingsSource.mjs`).
*/
export const RoomSection = ({ c }: { c: SectionCtx }) => {
  const {
    settings, onUpdate, sceneOn, onSceneToggle, sceneState, cameras, sceneDeviceId, onSceneDevice,
    scenePreviewRef, focusSection, keep, shown, goTo, listens, CARD, GRID, TITLE,
  } = c;
  return (
    <>

      {/* The Room Section */}
      {keep('room') && (
      <section id="settings-room" className={`${CARD} ${shown('room') ? GRID : 'hidden'} ${focusSection === 'room' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('room')} data-section="room">
        {/*
          Two cameras, two jobs, and the owner could not tell them apart
          (2026-10-24): "what the room control is vs. showing video on the
          plate". This one is a sensor. Its picture is never drawn; movement
          in front of it stirs the liquid. The film's Webcam is the other
          one, a picture on the plate. So the heading says what it does
          rather than where it points ("The Room"), the first line says the
          picture is never shown and where to go to show one, and the switch
          is the shared Toggle, so on and off read the way every other
          switch does. (PLAN 14ad.)
        */}
        <h3 className={TITLE}>
          <ScanEye size={12} /> Motion camera
        </h3>
        <p className="mb-2 text-[12px] leading-relaxed text-text-2" data-testid="scene-what">
          Movement in front of a camera stirs the liquid. Its picture is never shown. To put a camera&rsquo;s picture on the plate, use Webcam in {goTo('film', 'room')}.
        </p>
        <Info>
          Aim it at the floor or the crowd, not at the screen: a camera that can see the projection makes the plate drive itself. Hold people below is what tracks each person and puts their hands on the glass.
        </Info>
        <div className="mb-2">
          <Toggle
            label="Watch for movement"
            on={sceneOn}
            onChange={(v) => onSceneToggle?.(v)}
            testId="scene-toggle"
          />
        </div>
        <CameraPicker
          cameras={cameras}
          value={sceneDeviceId}
          onChange={(id) => onSceneDevice?.(id)}
          label="Motion camera"
          testId="scene-device"
          inUse={sceneState?.device}
          fellBack={sceneOn && !!sceneState?.fellBack}
        />
        {sceneOn && (
          <div className="mb-4">
            <canvas
              ref={scenePreviewRef}
              width={192}
              height={192}
              className="w-full aspect-square rounded-lg border border-white/10 bg-black/60"
              data-testid="scene-preview"
            />
            {sceneState?.error ? (
              <p className="mt-2 text-[12px] leading-relaxed text-amber-300/80" data-testid="scene-error">{sceneState.error}</p>
            ) : (
              <>
                <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-white/70 transition-[width] duration-100" style={{ width: `${Math.round((sceneState?.energy ?? 0) * 100)}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[12px] font-mono opacity-40">
                  <span>{sceneState?.active ? `${sceneState.people} tracked` : 'opening…'}</span>
                  <span>{sceneState ? `${sceneState.ms.toFixed(1)} ms` : ''}</span>
                </div>
              </>
            )}
            <p className="mt-2 text-[12px] leading-relaxed opacity-40">
              Frames are read in this page and never leave it. Nothing is recorded, and the camera stops the moment this is switched off.
            </p>
          </div>
        )}
        <Slider
          label="Room Drive"
          value={settings.sceneDrive ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sceneDrive: v })}
          disabled={!sceneOn && 'off'}
          settingKey="sceneDrive"
        />
        <Slider
          label="Room Impact"
          value={settings.sceneImpact ?? 0.5}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sceneImpact: v })}
          disabled={!sceneOn ? 'needs the room camera on' : !listens('room') && 'no patch reads the room'}
          settingKey="sceneImpact"
        />
        <Slider
          label="Hands"
          value={settings.sceneHands ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sceneHands: v })}
          disabled={!sceneOn ? 'off' : settings.scenePeople === false && 'needs Hold people'}
          settingKey="sceneHands"
        />
        <Slider
          label="Deadzone"
          value={settings.sceneDeadzone ?? 0.25}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sceneDeadzone: v })}
          disabled={!sceneOn && 'off'}
          settingKey="sceneDeadzone"
        />
        <Slider
          label="Smoothing"
          value={settings.sceneSmooth ?? 0.35}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ sceneSmooth: v })}
          disabled={!sceneOn && 'off'}
          settingKey="sceneSmooth"
        />
        <div className="flex items-center gap-2 mb-2">
          <button
            aria-pressed={settings.scenePeople !== false}
            onClick={() => onUpdate({ scenePeople: !(settings.scenePeople !== false) })}
            className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${settings.scenePeople !== false ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            data-testid="scene-people"
          >
            Hold people
          </button>
          <button
            aria-pressed={settings.sceneMirror !== false}
            onClick={() => onUpdate({ sceneMirror: !(settings.sceneMirror !== false) })}
            className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${settings.sceneMirror !== false ? LIT : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            data-testid="scene-mirror"
            title="Flip the camera's view left for right, for a camera facing the room"
          >
            Flip Camera
          </button>
        </div>
        {/* The patch bay was here. It reads the film, the sound and the shapes
            as well as this camera, so it has a section of its own now — and a
            line where it used to be, because this is where anyone who knew it
            will look first. */}
        <p className="mt-3 mb-3 text-[12px] leading-relaxed text-white/40">
          Any feature of the room onto any control is a patch, in {goTo('patches', 'room')}.
        </p>
        <Info>
          <span className="text-white/70">Room Drive</span> is how hard what happens in front of the lens stirs the lead plate: an arm swept across the room sweeps the dye the same way. Aim it at the floor or the crowd rather than at the screen: a camera that can see the projection makes the plate drive itself, and while that settles rather than running away, what it settles into is a plate being stirred by nothing in particular. <span className="text-white/70">Hands</span> puts each person on the glass: standing still is a palm pressed on the plate, walking is a puff of air the way they are going, and arriving drops their own dye — one of the preset's, picked by who they are, so the same dancer stays the same colour all set. <span className="text-white/70">Deadzone</span> is how much movement counts as someone rather than as the room breathing; <span className="text-white/70">Smoothing</span> how long the liquid remembers a gesture. <span className="text-white/70">Hold people</span> finds the figures in the frame and keeps hold of each one, which is what lets a person carry a dye; turning it off is cheaper. <span className="text-white/70">Flip Camera</span> for a camera facing the room, so a hand moved left moves the dye left.
        </Info>
      </section>
      )}
    </>
  );
};

export const FilmSection = ({ c }: { c: SectionCtx }) => {
  const {
    settings, onUpdate, cameras, filmSource, filmName, pourName, onFilmFile, onPourVideo,
    onStopPourVideo, onFilmCamera, filmCameraId, onFilmCameraDevice, filmCamera, filmCameraLost,
    onFilmWindow, onFilmClear, focusSection, embed, cartoons, filmInputRef, canCaptureWindow, keep,
    shown, goTo, listens, CARD, GRID, TITLE,
  } = c;
  return (
    <>

      {/*
        Film

        The film projector, as the input it is. It was the bottom third of
        Projectors, under the corner pin and a gel wheel, which put the one
        thing there that drives the plate in a section about the wall — and
        made that section the longest on the rail. A reel, a camera on a real
        dish or another window, how it shows, and what it does to the liquid.
      */}
      {keep('film') && (
      <section id="settings-film" className={`${CARD} ${shown('film') ? GRID : 'hidden'} ${focusSection === 'film' ? 'border-accent-border' : 'border-white/[0.07]'}`} data-group={groupOf('film')} data-section="film">
        <h3 className={TITLE}>
          <Video size={12} /> Film
        </h3>
        <div className="mt-2 mb-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-text">Source</span>
            <span className="min-w-0 truncate text-[12px] text-muted" data-testid="film-source-status">
              {filmSource === 'file' ? `playing ${filmName ?? 'a video file'}`
                : filmSource === 'camera' ? (filmCamera?.label ? `camera live: ${filmCamera.label}` : 'camera live')
                : filmSource === 'window' ? 'window live'
                : 'off'}
            </span>
          </div>
          <input
            ref={filmInputRef}
            id="film-loop-file"
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFilmFile?.(f); e.target.value = ''; }}
          />
          {/*
            One pick-one, the source lit (PLAN 35a). The owner, a loop
            playing: "I really can't tell what buttons are turned on/off."
            These were four grey buttons alike and Off was the only one that
            changed, by greying out, so the row said what was not playing and
            never what was. Video file opens the chooser even when it is the
            one lit, which is how a second file replaces the first.

            Wraps: as a 312px desk panel its four sources ran past the frame,
            and Off was cut off. Window is disabled rather than silently doing
            nothing where the browser has no screen capture, which is every
            phone: a button that looks pressable and answers with a console
            warning is the kind of control that makes someone doubt the rest
            of the panel.
          */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Film source" data-testid="film-source">
            {([
              ['none', 'Off', null, 'film-off', 'No film under the dye', () => onFilmClear?.()],
              ['file', 'Video file', Film, 'film-file', 'Play a video file from this machine through the dye, looping', () => filmInputRef.current?.click()],
              ['camera', 'Webcam', Camera, 'film-camera', 'Point a camera at a real dish of oil and composite it through the solver', () => onFilmCamera?.()],
              ['window', 'Window', MonitorPlay, 'film-window', canCaptureWindow
                ? 'Play another tab, window or screen through the dye: a film from the Internet Archive, a media player, anything on this machine'
                : 'This browser cannot capture a window. Desktop Chrome, Edge, Firefox and Safari can; phones cannot.', () => onFilmWindow?.()],
            ] as const).map(([id, label, Icon, testId, title, go]) => (
              <button
                key={id}
                aria-pressed={filmSource === id}
                onClick={go}
                disabled={id === 'window' && !canCaptureWindow}
                className={`flex ${id === 'none' ? '' : 'flex-1'} items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                  filmSource === id ? LIT : 'border-white/15 bg-white/5 text-text-2 hover:bg-white/10'
                }`}
                title={title}
                data-testid={testId}
              >
                {Icon && <Icon size={13} />} {label}
              </button>
            ))}
          </div>

          {/*
            Which camera the film shows, and what the film's camera is for
            (PLAN 14ad). It had no picker: the browser's "environment" camera
            or nothing. The line says the other camera's job too, because the
            owner could not tell this from the motion camera, and the two are
            two sections apart.
          */}
          <div className="mt-1" data-testid="film-camera-pick">
            <p className="mb-2 text-[12px] leading-relaxed text-text-2" data-testid="film-camera-what">
              Webcam shows a camera&rsquo;s picture on the plate, through the dye. To stir the liquid with movement instead, use the {goTo('room', 'film')}.
            </p>
            <CameraPicker
              cameras={cameras}
              value={filmCameraId}
              onChange={(id) => onFilmCameraDevice?.(id)}
              label="Webcam"
              testId="film-device"
              inUse={filmCamera?.label}
              fellBack={!!filmCamera?.fellBack}
            />
            {filmCameraLost && (
              <p className="-mt-1 mb-2 text-[12px] leading-relaxed text-amber-300/80" data-testid="film-camera-lost">
                The camera was unplugged. The film comes back on when it is plugged in again.
              </p>
            )}
          </div>

          <FilmShelves filmSource={filmSource} filmName={filmName} pourName={pourName} onFilmFile={onFilmFile} onFilmClear={onFilmClear} onPourVideo={onPourVideo} onStopPourVideo={onStopPourVideo} cartoons={embed ? undefined : cartoons} />

          <Info>
            <span className="text-white/60">Window</span> is the way to a film you did not download.
            Open one in another tab — the Internet Archive's Prelinger collection is thousands of
            public-domain reels of exactly this era — press Window, and pick that tab. It reaches what a
            link cannot: a video from another site plays in a page but cannot be read back into the
            plate, and almost nothing on the web sends the header that would allow it. A window has no
            origin, only pixels. Mute the tab and let the room's own sound drive the plate.
          </Info>
        </div>
        <Slider
          label="Film Mix"
          disabled={(filmSource ?? 'none') === 'none' && 'needs a loop, the camera or a window'}
          value={settings.filmMix ?? 0.7}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ filmMix: v })}
          settingKey="filmMix"
        />
        <Slider
          label="Film Key"
          disabled={(filmSource ?? 'none') === 'none' && 'needs a loop, the camera or a window'}
          value={settings.filmKey ?? 0.18}
          min={0}
          max={0.9}
          step={0.02}
          onChange={(v: number) => onUpdate({ filmKey: v })}
          settingKey="filmKey"
        />
        {/*
          The film as a force, not only a light.

          Film Mix and Film Key decide how the reel *shows*. Film Drive and
          the film's patches decide what it *does*: the same analysis that
          reads the room camera reads the film, so a pan drags the dye, a cut
          hits it, and a busy sequence can ride whatever a room patch rides.
          Film Drive and Film Impact (under Patches) both at zero — the
          default, and what every look saved before this does — and the
          projector is the slide it always was, with the sensor not even
          running.
        */}
        <Slider
          label="Film Drive"
          disabled={(filmSource ?? 'none') === 'none' && 'needs a loop, the camera or a window'}
          value={settings.filmDrive ?? 0}
          min={0}
          max={1}
          step={0.05}
          icon={Wind}
          onChange={(v: number) => onUpdate({ filmDrive: v })}
          settingKey="filmDrive"
        />
        <Slider
          label="Film Impact"
          disabled={(filmSource ?? 'none') === 'none'
            ? 'needs a loop, the camera or a window'
            : !listens('film') && 'no patch reads the film'}
          value={settings.filmImpact ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v: number) => onUpdate({ filmImpact: v })}
          settingKey="filmImpact"
        />
        <p className="mb-3 text-[12px] leading-relaxed text-white/40">
          Any feature of the film onto any control is a patch, in {goTo('patches', 'film')}, where Film Impact, just above, is its master.
        </p>
        {filmSource !== 'none' && (
          <Info>
            <span className="text-white/60">Film Drive</span> puts the film's own motion into the
            liquid: a pan drags the dye the way it pans, a crowd scene stirs it, a locked-off shot
            does nothing at all — which is right, because nothing is moving. A patch reads the same
            nine features off the reel that the room camera reads off the floor, so "how busy →
            Turbulence" works off either. One warning worth having: capture this app's own window
            with Film Drive up and you have built a feedback loop. It saturates rather than runs
            away — the stir is capped per cell — but a plate stirred by a picture of itself is a
            plate being stirred by nothing in particular.
          </Info>
        )}
      </section>
      )}
    </>
  );
};
