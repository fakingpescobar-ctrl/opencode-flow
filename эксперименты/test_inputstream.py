import sounddevice as sd
import numpy as np
import time

# Same parameters as whisper_listener.py
SAMPLE_RATE = 16000
CHANNELS = 1
DTYPE = 'float32'
CHUNK_SIZE = 480

collected = []
def cb(indata, frames, time_info, status):
    if status:
        print(f"status: {status}", flush=True)
    collected.append(indata.copy())

stream = sd.InputStream(
    samplerate=SAMPLE_RATE,
    channels=CHANNELS,
    dtype=DTYPE,
    blocksize=CHUNK_SIZE,
    callback=cb,
)
stream.start()
print("InputStream started, recording 5s...", flush=True)
time.sleep(5)
stream.stop()
stream.close()

if collected:
    audio = np.concatenate(collected, axis=0).flatten()
    rms = float(np.sqrt(np.mean(audio ** 2)))
    peak = float(np.max(np.abs(audio)))
    print(f"Got {len(collected)} chunks", flush=True)
    print(f"RMS={rms:.6f} Peak={peak:.6f}", flush=True)
else:
    print("NO AUDIO RECEIVED!", flush=True)
