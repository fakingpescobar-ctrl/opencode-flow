import sounddevice as sd
import numpy as np

duration = 3
for dev in [19, 0, 16, 15]:
    try:
        info = sd.query_devices(dev)
        if info['max_input_channels'] > 0:
            sr = int(info['default_samplerate'])
            print(f"Device {dev}: {info['name']} ({sr} Hz)", flush=True)
            rec = sd.rec(int(duration * sr), samplerate=sr, channels=info['max_input_channels'], dtype='float32', device=dev)
            sd.wait()
            rms = float(np.sqrt(np.mean(rec ** 2)))
            mx = float(np.max(np.abs(rec)))
            print(f"  RMS={rms:.8f} Max={mx:.6f}", flush=True)
    except Exception as e:
        print(f"Device {dev} error: {e}", flush=True)
