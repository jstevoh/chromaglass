import re

with open('src/components/PresetMenu.tsx', 'r') as f:
    code = f.read()

# Add docId and onReplaceCurrent to PresetMenuProps
pattern = r"onSaveCurrent\?: \(name: string, description: string, forSong\?: boolean\) => void;"
replacement = """onSaveCurrent?: (name: string, description: string, forSong?: boolean) => void;
  docId?: string | null;
  onReplaceCurrent?: () => void;
  onNewPalette?: () => void;"""
code = code.replace(pattern, replacement)

# Add them to the destructuring
pattern2 = r"userPresets = \[\], onApplyUserPreset, onSaveCurrent, onLoadFile, onExportUserPreset, onDeleteUserPreset, currentSong = null,"
replacement2 = """userPresets = [], onApplyUserPreset, onSaveCurrent, docId = null, onReplaceCurrent, onNewPalette, onLoadFile, onExportUserPreset, onDeleteUserPreset, currentSong = null,"""
code = code.replace(pattern2, replacement2)

with open('src/components/PresetMenu.tsx', 'w') as f:
    f.write(code)
