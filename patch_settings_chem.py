import re

with open('src/components/SettingsPanel.tsx', 'r') as f:
    code = f.read()

pattern = r"""<Slider
          label="Chemistry"
          value=\{settings\.chemistry \?\? 0\}
          min=\{0\}
          max=\{1\.0\}
          step=\{0\.05\}
          onChange=\{\(v: number\) => onUpdate\(\{ chemistry: v \}\)\}
          settingKey="chemistry"
        />"""

replacement = """<Slider
          label="Chemistry"
          value={settings.chemistry ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ chemistry: v })}
          settingKey="chemistry"
        />
        <Slider
          label="↳ Pattern (Spots to Labyrinth)"
          value={settings.chemistryPattern ?? 0}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ chemistryPattern: v })}
          settingKey="chemistryPattern"
        />
        <Slider
          label="↳ Pattern Width"
          value={settings.chemistryWidth ?? 0.5}
          min={0.1}
          max={1.0}
          step={0.01}
          onChange={(v: number) => onUpdate({ chemistryWidth: v })}
          settingKey="chemistryWidth"
        />"""

code = code.replace(pattern, replacement)

with open('src/components/SettingsPanel.tsx', 'w') as f:
    f.write(code)
