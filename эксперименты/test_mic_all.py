import sounddevice as sd
import numpy as np

devices_to_test = [0, 1, 15, 19, 21]
for dev in devices_to_test:
    try:
        info = sd.query_devices(dev)
        if info['max_input_channels'] > 0:
            sr = int(info['default_samplerate'])
            ch = min(info['max_input_channels'], 1)
            print(f"Device {dev}: {info['name']} ({sr} Hz) - RECORDING 3s...", flush=True)
            rec = sd.rec(int(3 * sr), samplerate=sr, channels=ch, dtype='float32', device=dev)
            sd.wait()
            energy = float(np.sqrt(np.mean(rec ** 2)))
            peak = float(np.max(np.abs(rec)))
            print(f"  RMS={energy:.6f}  Peak={peak:.6f}", flush=True)
    except Exception as e:
        print(f"Device {dev}: ERROR {e}", flush=True)
