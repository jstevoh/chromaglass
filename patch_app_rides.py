import re

with open('src/App.tsx', 'r') as f:
    code = f.read()

# Update saveCurrentPreset
pattern = r"const p = userPresets\.saveCurrent\(name, description, settingsRef\.current, plate\?\.contract \?\? null, plate\?\.injectStyles \?\? null, plate\?\.liquids \?\? null, forSong \? currentSong : null\);"
replacement = """const p = userPresets.saveCurrent(name, description, settingsRef.current, plate?.contract ?? null, plate?.injectStyles ?? null, plate?.liquids ?? null, forSong ? currentSong : null, rideKeys);"""
code = code.replace(pattern, replacement)

# When a user preset is applied, we should restore rides if they exist
# In applyUserPreset:
pattern2 = r"if \(p\.injectStyles\) PRESET_INJECT_STYLES\[p\.id\] = p\.injectStyles;"
replacement2 = """if (p.injectStyles) PRESET_INJECT_STYLES[p.id] = p.injectStyles;
    if (p.rides) setRideKeys(p.rides as any);"""
code = code.replace(pattern2, replacement2)

with open('src/App.tsx', 'w') as f:
    f.write(code)
