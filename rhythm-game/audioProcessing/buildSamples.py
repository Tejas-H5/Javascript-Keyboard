import os
import sys
import numpy as np
import scipy.io.wavfile

# This script converts wav samples into a format that can be consumed by the typescript codebase.

path = os.path.dirname(os.path.realpath(__file__))
output_path = os.path.join(
    path, 
    "..", 
    "src",
    "samples",
)
files = os.listdir(path)
wav_file_names = [f[0:-4] for f in files if f[-4:] == ".wav"]
files_to_write = []

for sample_name in wav_file_names:
    filename = sample_name + ".wav"
    filepath = os.path.join(path, filename)
    samplerate, data = scipy.io.wavfile.read(filepath)

    if data.dtype == "int16":
        data = data.astype("float32") / 32767
    elif data.dtype == "int32":
        data = data.astype("float32") / 2147483648
    elif data.dtype == "uint8":
        data = (data.astype("float32") / (2*255)) - 1

    try:
        combined = [x[0]/2 + x[1]/2 for x in data]
    except:
        combined = data
        pass

    code = "".join([
        "export const ",
        sample_name,
        # neovim sucks at loading files with very very long lines. breaking up a line into multiple lines fixes this issue.
        " = ",
        "[\n",
        ",\n".join([str(x) for x in combined]),
        "\n];",
    ])

    files_to_write.append((sample_name + ".ts", code))

imports = "\n".join([f"import {{ {name} }} from \"./{name}\";" for name in wav_file_names])
samples_object_contents = ", ".join(wav_file_names)
samples_union_type = " | ".join([f"\"{s}\"" for s in wav_file_names])
all_samples_code = f"""{imports}

export function getAllSamples() {{
    return {{ {samples_object_contents} }};
}}

export type Sample = {samples_union_type};
    
"""
files_to_write.append(("all-samples.ts", all_samples_code))

os.makedirs(output_path, exist_ok=True)
for existing_file_name in os.listdir(output_path):
    print(existing_file_name)
    existing_file_path = os.path.join(output_path, existing_file_name)
    try:
        os.remove(existing_file_name)
    except:
        #ignore
        pass

for (file_name, contents) in files_to_write:
    final_output_path = os.path.join(output_path, file_name)
    with open(final_output_path, "w") as f:
        f.write(contents)

