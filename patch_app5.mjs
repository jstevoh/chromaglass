import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
`  const deskDots = useMemo(() => ({
    mic: audioSource !== 'none',
    wall: isCasting,
    midi: midi.enabled,
    phone: remoteLink.status === 'connected',
    rec: recorder.recording ? String(recorder.seconds) : null,
    perf: perfClock,
  }), [audioSource, isCasting, midi.enabled, remoteLink.status, recorder.recording, recorder.seconds, perfClock]);`,
`  const deskDots = useMemo(() => ({
    sound: audioSource !== 'none',
    video: isCasting,
    midi: midi.enabled,
  }), [audioSource, isCasting, midi.enabled]);`
);

content = content.replace(
`  const deskOpen = useMemo(() => ({
    mic: () => openSettingsAt('audio-input'),
    wall: () => openSettingsAt('projectors'),
    midi: () => { setShowMidi(true); setShowSequencer(false); setShowSettings(false); setShowHelp(false); },
    // The phone has no setting to change — it either found the relay or it did
    // not — so this goes to the part of the guide that says what it does and
    // what has to be running for it to connect at all.
    phone: () => { setHelpFocus('live'); setShowHelp(true); setShowSettings(false); setShowMidi(false); setShowSequencer(false); },
  }), [openSettingsAt]);`,
`  const deskOpen = useMemo(() => ({
    sound: () => openSettingsAt('audio-input'),
    video: () => openSettingsAt('projectors'),
    midi: () => { setShowMidi(true); setShowSequencer(false); setShowSettings(false); setShowHelp(false); },
  }), [openSettingsAt]);`
);

content = content.replace(
`          onMic={deskOpen.mic}
          onWall={deskOpen.wall}
          onMidi={deskOpen.midi}
          onPhone={deskOpen.phone}
          onPerformance={recordPerformance}`,
`          onSound={deskOpen.sound}
          onVideo={deskOpen.video}
          onMidi={deskOpen.midi}`
);

content = content.replace(
`          onMic={deskOpen.mic}
          onWall={deskOpen.wall}
          onMidi={deskOpen.midi}
          onPhone={deskOpen.phone}
          onPerformance={recordPerformance}`,
`          onSound={deskOpen.sound}
          onVideo={deskOpen.video}
          onMidi={deskOpen.midi}`
);

fs.writeFileSync('src/App.tsx', content);
