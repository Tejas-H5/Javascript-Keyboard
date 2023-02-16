import os
import sys
import numpy as np

# I use this script to convert a wave file into a float array of samples
# that I can just paste into a JS file. Don't need to figure out how to
# load a file in JS if I can just do it in python

if len(sys.argv) != 2:
    print("need to input a filename")
    exit()

filepath = sys.argv[1]

import scipy.io.wavfile
samplerate, data = scipy.io.wavfile.read(filepath)

if data.dtype == "int16":
    data = data.astype("float32") / 32767
elif data.dtype == "int32":
    data = data.astype("float32") / 2147483648
elif data.dtype == "uint8":
    data = (data.astype("float32") / (2*255)) - 1

# TODO: do this properly
try:
    combined = [x[0]/2 + x[1]/2 for x in data]
except:
    combined = data
    pass

print("[" + ", ".join([str(x) for x in combined]) + "]")

# scipy.io.wavfile.write(filepath.split(".")[0] + ".wav", 48000, np.array(samples))
