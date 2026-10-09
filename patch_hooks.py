with open('src/hooks/useUserPresets.ts', 'r') as f:
    code = f.read()

import re
# saveCurrent
code = re.sub(r'const saveCurrent = useCallback\(\(name: string, description: string, settings: VisualizerSettings, contract: number\[\] \| null, injectStyles: string\[\] \| null, liquids: string\[\] \| null = null, song: SongRef \| null = null\): UserPreset => \{', 
              'const saveCurrent = useCallback((name: string, description: string, settings: VisualizerSettings, contract: number[] | null, injectStyles: string[] | null, liquids: string[] | null = null, song: SongRef | null = null, rides: string[] | null = null): UserPreset => {', code)
code = code.replace("liquids: liquids ?? undefined,\n      song", "liquids: liquids ?? undefined,\n      rides: rides ?? undefined,\n      song")
code = code.replace("liquids: liquids ?? undefined, song", "liquids: liquids ?? undefined,\n      rides: rides ?? undefined,\n      song")

# saveOver
code = re.sub(r'const saveOver = useCallback\(\(id: string, settings: VisualizerSettings, contract: number\[\] \| null, injectStyles: string\[\] \| null, liquids: string\[\] \| null = null\): UserPreset \| null => \{',
              'const saveOver = useCallback((id: string, settings: VisualizerSettings, contract: number[] | null, injectStyles: string[] | null, liquids: string[] | null = null, rides: string[] | null = null): UserPreset | null => {', code)
code = re.sub(r'p\.liquids = liquids \?\? undefined;\s*upsert\(p\);', 'p.liquids = liquids ?? undefined;\n      p.rides = rides ?? undefined;\n      upsert(p);', code)

with open('src/hooks/useUserPresets.ts', 'w') as f:
    f.write(code)
