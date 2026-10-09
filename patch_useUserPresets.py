import re

with open('src/hooks/useUserPresets.ts', 'r') as f:
    code = f.read()

# saveCurrent
pattern = r"const saveCurrent = useCallback\(\(name: string, description: string, settings: VisualizerSettings, contract: number\[\] \| null, injectStyles: string\[\] \| null, liquids: string\[\] \| null = null, song: SongRef \| null = null\): UserPreset => \{"
replacement = """const saveCurrent = useCallback((name: string, description: string, settings: VisualizerSettings, contract: number[] | null, injectStyles: string[] | null, liquids: string[] | null = null, song: SongRef | null = null, rides: string[] | null = null): UserPreset => {"""
code = code.replace(pattern, replacement)

pattern2 = r"liquids: liquids \?\? undefined,\s*song"
replacement2 = """liquids: liquids ?? undefined,
      rides: rides ?? undefined,
      song"""
code = re.sub(pattern2, replacement2, code)

# saveOver
pattern3 = r"const saveOver = useCallback\(\(id: string, settings: VisualizerSettings, contract: number\[\] \| null, injectStyles: string\[\] \| null, liquids: string\[\] \| null = null\): UserPreset \| null => \{"
replacement3 = """const saveOver = useCallback((id: string, settings: VisualizerSettings, contract: number[] | null, injectStyles: string[] | null, liquids: string[] | null = null, rides: string[] | null = null): UserPreset | null => {"""
code = code.replace(pattern3, replacement3)

pattern4 = r"p\.liquids = liquids \?\? undefined;\s*upsert\(p\);"
replacement4 = """p.liquids = liquids ?? undefined;
      p.rides = rides ?? undefined;
      upsert(p);"""
code = re.sub(pattern4, replacement4, code)

with open('src/hooks/useUserPresets.ts', 'w') as f:
    f.write(code)
