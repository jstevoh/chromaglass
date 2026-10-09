import re

with open('src/App.tsx', 'r') as f:
    code = f.read()

pattern = r"setSettings\(DEFAULT_SETTINGS\);\s*visualizerRef\.current\?\.applyPreset\('default', DEFAULT_SETTINGS\);"
replacement = """applyPreset('default', DEFAULT_SETTINGS);"""
code = re.sub(pattern, replacement, code)

with open('src/App.tsx', 'w') as f:
    f.write(code)
