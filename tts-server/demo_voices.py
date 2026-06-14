import os, time, ctypes, tempfile
from elevenlabs import ElevenLabs

api_key = "sk_c26248e73b13c4c0c553be5a76b8a1ab59d15c1c0be95a29"
client = ElevenLabs(api_key=api_key, timeout=10)

def mci(cmd):
    return ctypes.windll.winmm.mciSendStringW(cmd, None, 0, 0)

def play_mp3(path):
    alias = "demomp3"
    mci(f"close {alias}")
    err = mci(f'open "{path}" type mpegvideo alias {alias}')
    if err != 0:
        err = mci(f'open "{path}" alias {alias}')
    if err != 0:
        print(f"  MCI error: {err}")
        return
    mci(f"play {alias} wait")
    mci(f"close {alias}")

text = "Привет! Я голос ElevenLabs. Как я звучу?"

voices = [
    ("21m00Tcm4TlvDq8ikWAM", "Rachel — женский, нейтральный"),
    ("AZnzlk1XvdvUeBnXmlld", "Domi — женский, тёплый"),
    ("CYw3kZ02Hs0563khs1Fj", "Adam — мужской"),
    ("ODq5zmih8GrVes37Dizd", "Patrick — мужской"),
    ("XB0fDUnXU5powFXDhCwa", "Charlotte — женский, британский"),
    ("N2lVS1w4EtoT3dr4eOWO", "Callum — мужской"),
    ("ThT5KcBeYPX3keUQqHPh", "Gigi — женский"),
]

for vid, desc in voices:
    print(f"\n[{desc}]")
    print("  Генерирую...", end=" ", flush=True)
    gen = client.text_to_speech.convert(text=text, voice_id=vid, model_id="eleven_flash_v2_5")
    data = b"".join(gen)
    fd, path = tempfile.mkstemp(suffix=".mp3", prefix="voice_demo_")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    print("воспроизвожу...")
    play_mp3(path)
    os.remove(path)
    time.sleep(0.5)

print("\nВсе образцы проиграны.")
