import json, os, requests

cfg = json.load(open(os.path.expanduser('~/.opencode-tts/telegram-config.json'), encoding='utf-8'))
BASE = f'https://api.telegram.org/bot{cfg["token"]}'

text = "Форк — это скопировать проект к себе на GitHub и делать свою версию. Код открытый, бери, меняй, предлагай правки. Если что — помогу разобраться 🤝"
r = requests.post(f'{BASE}/sendMessage', json={
    "chat_id": -1003939462897, "text": text,
    "reply_to_message_id": 31, "parse_mode": "HTML",
}, timeout=10)

ok = r.json().get("ok", False)
if ok:
    pending = json.load(open(os.path.expanduser('~/.opencode-tts/pending-comments.json'), encoding='utf-8'))
    for c in pending:
        if c["id"] == 31:
            c["replied"] = True
            c["reply_text"] = text
    json.dump(pending, open(os.path.expanduser('~/.opencode-tts/pending-comments.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print("OK")
else:
    print(f"FAIL: {r.text}")
