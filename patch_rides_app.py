import re

with open('src/App.tsx', 'r') as f:
    code = f.read()

pattern = r"const saved = userPresets\.saveOver\(docId, settingsRef\.current, plate\?\.contract \?\? null, plate\?\.injectStyles \?\? null, plate\?\.liquids \?\? null\);"
replacement = """const saved = userPresets.saveOver(docId, settingsRef.current, plate?.contract ?? null, plate?.injectStyles ?? null, plate?.liquids ?? null, rideKeys as string[]);"""
code = code.replace(pattern, replacement)

with open('src/App.tsx', 'w') as f:
    f.write(code)
