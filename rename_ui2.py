import re

files = ['src/components/desk/SaveLookSheet.tsx', 'src/components/PresetMenu.tsx']

for file in files:
    with open(file, 'r') as f:
        code = f.read()
    
    code = code.replace("Save as a new preset", "Save as a new palette")
    code = code.replace(">Preset<", ">Palette<")
    code = code.replace(">Presets<", ">Palettes<")
    code = code.replace("My preset", "My palette")
    code = code.replace("Saved presets", "Saved palettes")
    code = code.replace("Built-in presets", "Built-in palettes")
    code = code.replace("Name this preset", "Name this palette")
    code = code.replace("A saved preset", "A saved palette")
    
    with open(file, 'w') as f:
        f.write(code)

with open('src/App.tsx', 'r') as f:
    app_code = f.read()
app_code = app_code.replace(">Preset <", ">Palette <")
with open('src/App.tsx', 'w') as f:
    f.write(app_code)
