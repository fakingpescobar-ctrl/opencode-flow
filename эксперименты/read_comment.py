import json, os, requests

CONFIG = os.path.expanduser('~/.opencode-tts/telegram-config.json')
with open(CONFIG, encoding='utf-8') as f:
    cfg = json.load(f)

BASE = f'https://api.telegram.org/bot{cfg["token"]}'
r = requests.get(f'{BASE}/getUpdates', params={
    'allowed_updates': json.dumps(["message"])
}).json()

for u in r['result']:
    msg = u.get('message') or {}
    if msg.get('chat',{}).get('id') == -1003939462897:
        out = {
            'from': msg['from']['username'],
            'text': msg.get('text',''),
            'id': msg['message_id']
        }
        with open('C:/Users/OLD/AppData/Local/Temp/opencode/comment.txt', 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False)
        print(json.dumps(out, ensure_ascii=False))
