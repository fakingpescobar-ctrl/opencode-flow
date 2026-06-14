import json, os, requests

CONFIG = os.path.expanduser('~/.opencode-tts/telegram-config.json')
with open(CONFIG, encoding="utf-8") as f:
    cfg = json.load(f)

TOKEN = cfg["token"]
DISCUSSION = cfg.get("discussion_group")
BASE = f'https://api.telegram.org/bot{TOKEN}'

r = requests.get(f'{BASE}/getUpdates', params={
    "offset": 0,
    "allowed_updates": json.dumps(["message", "channel_post"]),
}, timeout=15)

data = r.json()
updates = data.get("result", [])

print(f"Total updates: {len(updates)}")
for update in updates:
    uid = update["update_id"]
    msg = update.get("message") or update.get("channel_post") or {}
    chat_id = msg.get("chat", {}).get("id") if msg else None
    text = msg.get("text", "")
    print(f"update_id={uid} chat_id={chat_id} text='{text}'")
    print(f"  DISCUSSION={DISCUSSION} match={chat_id==DISCUSSION if chat_id and DISCUSSION else 'n/a'}")
