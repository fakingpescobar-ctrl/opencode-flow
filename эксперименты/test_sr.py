import sounddevice as sd
import numpy as np

# Test the same recording at different sample rates
sr_44100 = 44100
sr_16000 = 16000
duration = 3

print("Recording at 44100 Hz...", flush=True)
rec1 = sd.rec(int(duration * sr_44100), samplerate=sr_44100, channels=1, dtype='float32')
sd.wait()
rms1 = float(np.sqrt(np.mean(rec1 ** 2)))
print(f"  44100 Hz: RMS={rms1:.6f}", flush=True)

print("Recording at 16000 Hz...", flush=True)
rec2 = sd.rec(int(duration * sr_16000), samplerate=sr_16000, channels=1, dtype='float32')
sd.wait()
rms2 = float(np.sqrt(np.mean(rec2 ** 2)))
print(f"  16000 Hz: RMS={rms2:.6f}", flush=True)

print("Done. Speak during the next test if you can.", flush=True)
