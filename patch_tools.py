import re

with open('src/App.tsx', 'r') as f:
    app_code = f.read()

# Replace all occurrences of setActiveTool('dropper') that happen together with setSelectedLiquidId or updateLiquidColor
app_code = re.sub(r'setSelectedLiquidId\(liq\.id\);\s*setActiveTool\(\'dropper\'\);', "setSelectedLiquidId(liq.id);", app_code)
app_code = re.sub(r'setSelectedLiquidId\(([^)]+)\);\s*setActiveTool\(\'dropper\'\);', r"setSelectedLiquidId(\1);", app_code)
app_code = re.sub(r'updateLiquidColor\(selectedLiquidId, hex\);\s*setActiveTool\(\'dropper\'\);', "updateLiquidColor(selectedLiquidId, hex);", app_code)

with open('src/App.tsx', 'w') as f:
    f.write(app_code)
