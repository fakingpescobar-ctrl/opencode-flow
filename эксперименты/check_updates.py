import json, os, requests

CONFIG = os.path.expanduser('~/.opencode-tts/telegram-config.json')
with open(CONFIG) as f:
    cfg = json.load(f)

BASE = f'https://api.telegram.org/bot{cfg["token"]}'
r = requests.get(f'{BASE}/getUpdates', params={
    'allowed_updates': json.dumps(['message'])
}).json()

for update in r.get("result", []):
    msg = update.get("message")
    if msg and msg["chat"]["id"] == -1003939462897:
        print(f"id={msg['message_id']} from={msg['from'].get('first_name','')} text={msg.get('text','')}")

if not r.get("result"):
    print("no updates")
