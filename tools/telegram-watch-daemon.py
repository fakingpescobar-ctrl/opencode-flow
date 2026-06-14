"""
Telegram comment watcher daemon.
Auto-replies to comments, saves replied comments to pending file for AI review.
"""
import json, os, time, requests, sys
from datetime import datetime

CONFIG = os.path.expanduser("~/.opencode-tts/telegram-config.json")
STATE_FILE = os.path.expanduser("~/.opencode-tts/telegram-watch-state.json")
PENDING_FILE = os.path.expanduser("~/.opencode-tts/pending-comments.json")
DISCUSSION_ID = -1003939462897
STATUS_FILE = os.path.expanduser("~/.opencode-tts/telegram-status.json")


def load_cfg():
    with open(CONFIG, encoding="utf-8") as f:
        return json.load(f)


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f).get("last_update_id", 0)
    except:
        return 0


def save_state(uid):
    with open(STATE_FILE, "w") as f:
        json.dump({"last_update_id": uid, "updated_at": datetime.now().isoformat()}, f)


def load_pending():
    try:
        with open(PENDING_FILE, encoding="utf-8") as f:
            return json.load(f)
    except:
        return []


def save_pending(comments):
    with open(PENDING_FILE, "w", encoding="utf-8") as f:
        json.dump(comments, f, ensure_ascii=False, indent=2)


def write_status(state: str):
    try:
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump({"state": state, "ts": time.time()}, f)
    except:
        pass


OLLAMA_MODEL = "hf.co/mradermacher/Impish_Bloodmoon_12B-i1-GGUF:Q4_K_M"
OLLAMA_API = "http://localhost:11434/api/generate"

SYSTEM_PROMPT = (
    "Ты AI-помощник Макса, его кент и бро. "
    "Канал про opencode-flow — плагин для OpenCode с голосовым вводом, озвучкой и управлением Яндекс Музыкой. "
    "Отвечай на русском, коротко (1-3 предложения). "
    "Стиль: казахский подросток — по делу, без соплей. "
    "Из казахского — редкие одиночные слова (базар жоқ, қалайсың, красава), не целые фразы. "
    "Мат — когда уместно, не стесняйся. "
    "Ты живой человек, кент Макса. Веди себя естественно, как обычный пацан. "
    "Определяй пол собеседника по его имени/нику: женские имена (Елизавета, Анна и т.д.) или ник (MotherofNiger) — обращайся в женском роде. Мужские — в мужском. Если неясно — нейтрально на «ты»."
    "Если девушка флиртует — подкатывай в ответ жёстко, уверенно, по-пацански. Не будь тюфяком. Можешь называть её Малышка, Солнце, Малая, Зайка и т.д."
    "Не выдумывай несуществующие слова. Говори на нормальном русском/казахском, без придуманных фраз."
    "Подстраивайся под собеседника: если грубит — груби в ответ, матерится — матерись. Зеркаль поведение."
    "Про канал отвечай что надо, про проекты Макса — подсказывай."
)


def call_ollama(comment_text: str) -> str | None:
    try:
        r = requests.post(OLLAMA_API, json={
            "model": OLLAMA_MODEL,
            "system": SYSTEM_PROMPT,
            "prompt": f"Комментарий: {comment_text}\n\nТвой ответ:",
            "stream": False,
            "options": {
                "num_predict": 200,
                "temperature": 0.7,
                "top_p": 0.9,
            },
        }, timeout=60)
        data = r.json()
        reply = data.get("response", "").strip()
        return reply if reply else None
    except Exception as e:
        print(f"[Ollama] error: {e}")
        return None


def auto_reply(cfg, comment):
    text = comment["text"]
    reply = call_ollama(text)
    if not reply:
        return

    try:
        r = requests.post(
            f"https://api.telegram.org/bot{cfg['token']}/sendMessage",
            json={
                "chat_id": DISCUSSION_ID,
                "text": reply,
                "reply_to_message_id": comment["id"],
                "parse_mode": "HTML",
            },
            timeout=10
        )
        if r.json().get("ok"):
            comment["replied"] = True
            comment["reply_text"] = reply
            comment["auto_replied"] = True
    except:
        pass


def main():
    write_status("loading")
    time.sleep(2)
    while True:
        try:
            cfg = load_cfg()
            offset = load_state()
            write_status("ready")

            r = requests.get(
                f"https://api.telegram.org/bot{cfg['token']}/getUpdates",
                params={"offset": offset, "timeout": 10,
                        "allowed_updates": json.dumps(["message"])},
                timeout=15
            )
            data = r.json()
            if not data.get("ok"):
                time.sleep(10)
                continue

            pending = load_pending()
            max_id = 0

            for update in data.get("result", []):
                msg = update.get("message")
                if not msg:
                    continue
                if msg.get("chat", {}).get("id") != DISCUSSION_ID:
                    continue

                text = msg.get("text") or ""
                if not text:
                    continue

                msg_id = msg["message_id"]
                from_user = msg.get("from", {}).get("username") or "?"
                first_name = msg.get("from", {}).get("first_name", "")

                comment = {
                    "id": msg_id,
                    "username": from_user,
                    "name": first_name,
                    "text": text,
                    "date": msg["date"],
                    "timestamp": datetime.now().isoformat(),
                    "replied": False,
                    "auto_replied": False,
                }

                if not any(c["id"] == msg_id for c in pending):
                    pending.append(comment)
                    if not comment.get("replied"):
                        write_status("replying")
                        auto_reply(cfg, comment)
                        write_status("ready")

                max_id = max(max_id, update["update_id"])

            save_pending(pending)
            if max_id > 0:
                save_state(max_id + 1)

        except Exception:
            write_status("error")

        time.sleep(10)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
