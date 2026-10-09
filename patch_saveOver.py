import re

with open('src/lib/userPresets.ts', 'r') as f:
    code = f.read()

code = code.replace("liquids: string[] | null): UserPreset | null {", "liquids: string[] | null, rides: string[] | null = null): UserPreset | null {")
code = code.replace("liquids: liquids ?? undefined,", "liquids: liquids ?? undefined,\n      rides: rides ?? undefined,")

with open('src/lib/userPresets.ts', 'w') as f:
    f.write(code)

with open('src/App.tsx', 'r') as f:
    app_code = f.read()

pattern = r"const saved = userPresets\.saveOver\(docId, settingsRef\.current, plate\?\.contract \?\? null, plate\?\.injectStyles \?\? null, plate\?\.liquids \?\? null\);"
replacement = """const saved = userPresets.saveOver(docId, settingsRef.current, plate?.contract ?? null, plate?.injectStyles ?? null, plate?.liquids ?? null, rideKeys);"""
app_code = app_code.replace(pattern, replacement)

with open('src/App.tsx', 'w') as f:
    f.write(app_code)
