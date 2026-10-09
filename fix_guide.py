import re

with open('src/components/GuidePanel.tsx', 'r') as f:
    code = f.read()

code = code.replace("<Em>Save current</Em>", "<Em>Save As...</Em>")
code = code.replace("['Save current',", "['Save As...',")

with open('src/components/GuidePanel.tsx', 'w') as f:
    f.write(code)
