import re

with open('src/lib/userPresets.ts', 'r') as f:
    code = f.read()

# Add rides to UserPreset interface
code = code.replace("liquids?: string[];", "liquids?: string[];\n  rides?: string[];")

# Modify saveCurrent to accept rides
code = code.replace("liquids: string[] | null, song: SongRef | null): UserPreset {", "liquids: string[] | null, song: SongRef | null, rides: string[] | null = null): UserPreset {")

code = code.replace("liquids: liquids ?? undefined,", "liquids: liquids ?? undefined,\n      rides: rides ?? undefined,")

with open('src/lib/userPresets.ts', 'w') as f:
    f.write(code)
