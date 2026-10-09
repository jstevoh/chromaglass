import re

with open('src/types.ts', 'r') as f:
    code = f.read()

# Add to VisualizerSettings
settings_pattern = "chemistry: number;          // a reaction-diffusion field grows patterns that deposit dye — Boyle's bench, not a clock face"
settings_replacement = """chemistry: number;          // a reaction-diffusion field grows patterns that deposit dye — Boyle's bench, not a clock face
  chemistryPattern: number;
  chemistryWidth: number;"""
code = code.replace(settings_pattern, settings_replacement)

# Add to DEFAULT_SETTINGS
default_pattern = "chemistry: 0,"
default_replacement = """chemistry: 0,
  chemistryPattern: 0,
  chemistryWidth: 0.5,"""
code = code.replace(default_pattern, default_replacement)

with open('src/types.ts', 'w') as f:
    f.write(code)
