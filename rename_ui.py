import re
import glob

files = ['src/App.tsx', 'src/components/desk/SaveLookSheet.tsx', 'src/components/PresetMenu.tsx']

for file in files:
    with open(file, 'r') as f:
        code = f.read()
    
    code = code.replace("Save as a new preset", "Save as a new palette")
    code = code.replace("save as a new preset", "save as a new palette")
    code = code.replace(">Preset<", ">Palette<")
    code = code.replace(">Presets<", ">Palettes<")
    code = code.replace("My preset", "My palette")
    code = code.replace("Saved presets", "Saved palettes")
    code = code.replace("Built-in presets", "Built-in palettes")
    code = code.replace("Preset ", "Palette ")
    code = code.replace("preset ", "palette ")
    
    # Revert accidental variable renames if they happened
    code = code.replace("onApplypalette", "onApplyPreset")
    
    with open(file, 'w') as f:
        f.write(code)
