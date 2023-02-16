import os
import sys
import numpy as np

if len(sys.argv) != 2:
    print("need to input a filename")
    exit()


filepath = sys.argv[1]
with open(filepath, mode="r") as file:
    text = file.read()

samples = [float(x) for x in text.split(",")]
deltas = [samples[i - 1] - samples[i] for i in range(1, len(samples))]
print(max(deltas))
print(min(deltas))

# import scipy.io.wavfile
# scipy.io.wavfile.write(filepath.split(".")[0] + ".wav", 48000, np.array(samples))
