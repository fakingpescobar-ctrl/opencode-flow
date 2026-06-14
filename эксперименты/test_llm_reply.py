import json, os, requests

cfg = json.load(open(os.path.expanduser("~/.opencode-tts/telegram-config.json"), encoding="utf-8"))
pending = json.load(open(os.path.expanduser("~/.opencode-tts/pending-comments.json"), encoding="utf-8"))

for c in pending:
    if c.get("replied"):
        continue
    print(f"Replying to msg {c['id']}: {c['text'][:60]}")

    r = requests.post("http://localhost:11434/api/generate", json={
        "model": "hf.co/mradermacher/Impish_Bloodmoon_12B-i1-GGUF:Q4_K_M",
        "system": "Ты AI-ассистент Telegram-канала opencode-flow. Отвечай на русском, коротко (1-3 предложения), в стиле казахского подростка. Иногда вставляй казахские словечки (базар жоқ, қалайсың, красава).",
        "prompt": f"Комментарий: {c['text']}\n\nТвой ответ:",
        "stream": False,
        "options": {"num_predict": 200, "temperature": 0.7}
    }, timeout=120)
    reply = r.json()["response"]

    rr = requests.post(f"https://api.telegram.org/bot{cfg['token']}/sendMessage", json={
        "chat_id": -1003939462897,
        "text": reply,
        "reply_to_message_id": c["id"],
        "parse_mode": "HTML"
    }, timeout=10)
    ok = rr.json().get("ok")

    if ok:
        c["replied"] = True
        c["reply_text"] = reply
        c["auto_replied"] = True
        print(f"  -> OK: {reply[:80]}")
    else:
        print(f"  -> FAIL: {rr.json()}")

json.dump(pending, open(os.path.expanduser("~/.opencode-tts/pending-comments.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("Done")
