import json, os, requests

CONFIG = os.path.expanduser('~/.opencode-tts/telegram-config.json')
with open(CONFIG, encoding="utf-8") as f:
    raw = f.read()

cfg = json.loads(raw)
print(f"discussion_group in cfg: {cfg.get('discussion_group')}")
print(f"type: {type(cfg.get('discussion_group'))}")

DISCUSSION = cfg.get("discussion_group")
TOKEN = cfg["token"]
BASE = f'https://api.telegram.org/bot{TOKEN}'

r = requests.get(f'{BASE}/getUpdates', params={
    "offset": 0,
    "allowed_updates": json.dumps(["message", "channel_post"]),
}, timeout=15)

updates = r.json().get("result", [])
for update in updates:
    msg = update.get("message") or update.get("channel_post") or {}
    chat_id = msg.get("chat", {}).get("id") if msg else None
    print(f"chat_id type: {type(chat_id)}, value: {chat_id}")
    print(f"DISCUSSION type: {type(DISCUSSION)}, value: {DISCUSSION}")
    print(f"direct == comparison: {chat_id == DISCUSSION}")
    print(f"str comparison: {str(chat_id) == str(DISCUSSION)}")
