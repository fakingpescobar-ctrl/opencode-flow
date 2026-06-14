import sounddevice as sd
for dev in range(sd.query_devices().__len__()):
    info = sd.query_devices(dev)
    if info['max_input_channels'] > 0:
        api = sd.query_hostapis(info['hostapi'])
        print(f'{dev}: {info["name"]} ({info["max_input_channels"]} in) [{api["name"]}]')
