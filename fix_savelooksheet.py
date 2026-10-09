import re

with open('src/components/desk/SaveLookSheet.tsx', 'r') as f:
    code = f.read()

# Change "Replace 'name'" to "Save 'name'"
code = code.replace("Replace “{replaceName}”", "Save “{replaceName}”")

# Change "Save" button to "Save As..." (only the text on the button, not the function name)
code = code.replace(">Save</Button>", ">Save As...</Button>")

# Adjust title
code = code.replace('title={`Write the current settings over “${replaceName}”, keeping its name`}', 'title={`Save changes to “${replaceName}”`}')

with open('src/components/desk/SaveLookSheet.tsx', 'w') as f:
    f.write(code)
