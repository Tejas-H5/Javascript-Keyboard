import os
import sys
import base64

# This script reads all the font files, and then inserts them into the css as base64, such that it can be pasted
# directly into our HTML file (or typescript file). This allows us to continue shipping the entire game as a singular HTML file.

# Inter font family: https://rsms.me/inter/
# It has a permissive license.

path = os.path.dirname(os.path.realpath(__file__))
input_path = os.path.join(
    path,
    "Inter",
    "web",
)
output_path = os.path.join(
    path, 
    "..", 
    "src",
    "fonts",
)
files = os.listdir(input_path)
extension = ".woff2"
variant_names = []
for f in files:
    if f[-len(extension):] == extension:
        variant_names.append(f[0:-len(extension)])

# inter-partial - we only need the variable font - supposedly, it can procedurally generate all the other fonts
# by stretching the various points on the text along various axes, which substantially reduces the filesize.
with open(os.path.join(input_path, "inter-partial.css")) as file:
    text = file.read()

for name in variant_names:
    filename = name + extension
    filepath = os.path.join(input_path, filename)

    with open(filepath, 'rb') as file:
        file_bytes = file.read()
        encoded_bytes = base64.b64encode(file_bytes)
        encoded_string = encoded_bytes.decode('utf-8')
        filename_url = f"""url("{filename}")"""
        text = text.replace(filename_url, f"""url(data:application/x-font-woff;charset=utf-8;base64,{encoded_string})""")

text = f"export const INTER_FONT_CSS = `{text}`"

text = text.replace("InterVariable", "MainGameFont")


with open(os.path.join(output_path, "fonts.ts"), "w") as f:
    f.write(text)

