import json, os, requests

cfg = json.load(open(os.path.expanduser('~/.opencode-tts/telegram-config.json'), encoding='utf-8'))
BASE = f'https://api.telegram.org/bot{cfg["token"]}'
r = requests.get(f'{BASE}/getUpdates', params={'allowed_updates': json.dumps(["message"])}, timeout=10).json()

for u in r.get('result', []):
    m = u.get('message') or {}
    if m.get('chat',{}).get('id') == -1003939462897:
        with open('C:/Users/OLD/AppData/Local/Temp/opencode/raw_comment.txt', 'a', encoding='utf-8') as f:
            f.write(json.dumps({'id': m['message_id'], 'from': m['from'].get('username','?'), 'text': m.get('text','')}, ensure_ascii=False) + '\n')
print('done')
