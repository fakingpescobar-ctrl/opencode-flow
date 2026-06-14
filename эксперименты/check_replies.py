import json, os, requests

CONFIG = os.path.expanduser('~/.opencode-tts/telegram-config.json')
with open(CONFIG, encoding='utf-8') as f:
    cfg = json.load(f)

BASE = f'https://api.telegram.org/bot{cfg["token"]}'
r = requests.get(f'{BASE}/getUpdates', params={
    'allowed_updates': json.dumps(["message"])
}).json()

for u in r.get('result', []):
    msg = u.get('message') or {}
    if msg.get('chat',{}).get('id') == -1003939462897:
        out = {
            'id': msg['message_id'],
            'from': f"{msg['from'].get('first_name','')} (@{msg['from'].get('username','')})",
            'text': msg.get('text',''),
            'reply_to': msg.get('reply_to_message_id'),
            'date': msg['date']
        }
        with open('C:/Users/OLD/AppData/Local/Temp/opencode/replies.txt', 'a', encoding='utf-8') as f:
            f.write(json.dumps(out, ensure_ascii=False) + '\n')
        print(json.dumps(out, ensure_ascii=False))
