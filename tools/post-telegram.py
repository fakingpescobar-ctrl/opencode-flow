"""Post text or photo to Telegram channel."""
import json, sys, os, requests

CONFIG = os.path.expanduser("~/.opencode-tts/telegram-config.json")
with open(CONFIG, encoding="utf-8") as f:
    cfg = json.load(f)

TOKEN = cfg["token"]
CHAT = cfg["channel"]
BASE = f"https://api.telegram.org/bot{TOKEN}"


def send_text(text: str, silent: bool = False):
    r = requests.post(f"{BASE}/sendMessage", json={
        "chat_id": CHAT, "text": text, "parse_mode": "Markdown",
        "disable_notification": silent,
    }, timeout=10)
    data = r.json()
    if data.get("ok"):
        print("OK: text sent")
    else:
        print(f"FAIL: {data}")


def send_photo(photo_path: str, caption: str = ""):
    with open(photo_path, "rb") as f:
        r = requests.post(f"{BASE}/sendPhoto", data={
            "chat_id": CHAT, "caption": caption,
        }, files={"photo": f}, timeout=20)
    data = r.json()
    if data.get("ok"):
        print("OK: photo sent")
    else:
        print(f"FAIL: {data}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: post-telegram.py <text> [--silent]")
        print("       post-telegram.py --photo <path> [caption]")
        sys.exit(1)

    if sys.argv[1] == "--photo" and len(sys.argv) >= 3:
        caption = sys.argv[3] if len(sys.argv) > 3 else ""
        send_photo(sys.argv[2], caption)
    else:
        silent = "--silent" in sys.argv
        text = " ".join(a for a in sys.argv[1:] if a != "--silent")
        send_text(text, silent)
