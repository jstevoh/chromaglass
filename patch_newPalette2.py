import re

with open('src/App.tsx', 'r') as f:
    code = f.read()

new_palette_func = """  const newPalette = () => {
    setDocId(null);
    setDocDirty(false);
    setPinnedPresetId(null);
    setSettings(DEFAULT_SETTINGS);
    visualizerRef.current?.applyPreset('default', DEFAULT_SETTINGS);
  };
"""
code = code.replace("  const saveLook = () => setShowSave(true);", new_palette_func + "\n  const saveLook = () => setShowSave(true);")

pattern = r"<PresetMenu activePresetId=\{activePresetId\} onApplyPreset=\{applyPreset\} onCuePreset=\{cueLook\} onClose=\{\(\) => setPresetMenu\('none'\)\} userPresets=\{userPresets\.presets\} onApplyUserPreset=\{applyUserPreset\} onSaveCurrent=\{saveCurrentPreset\} onLoadFile=\{loadPresetFile\} onExportUserPreset=\{userPresets\.exportPreset\} onDeleteUserPreset=\{deleteSavedLook\} currentSong=\{currentSong\} align=\"left\" />"
replacement = """<PresetMenu activePresetId={activePresetId} onApplyPreset={applyPreset} onCuePreset={cueLook} onClose={() => setPresetMenu('none')} userPresets={userPresets.presets} onApplyUserPreset={applyUserPreset} onSaveCurrent={saveCurrentPreset} docId={docId} onReplaceCurrent={replaceLook} onNewPalette={newPalette} onLoadFile={loadPresetFile} onExportUserPreset={userPresets.exportPreset} onDeleteUserPreset={deleteSavedLook} currentSong={currentSong} align="left" />"""
code = code.replace(pattern, replacement)

with open('src/App.tsx', 'w') as f:
    f.write(code)
