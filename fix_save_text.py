import re

with open('src/components/PresetMenu.tsx', 'r') as f:
    code = f.read()

code = code.replace("<Save size={12} /> Save current", "<Save size={12} /> Save As...")

with open('src/components/PresetMenu.tsx', 'w') as f:
    f.write(code)
