"""
Telegram channel comment watcher.
Usage: telegram-watch.py [--reply]
  --reply   - send a reply to the last comment (reads from stdin)
"""
import json, os, sys, time, requests
from datetime import datetime

CONFIG = os.path.expanduser("~/.opencode-tts/telegram-config.json")
STATE_FILE = os.path.expanduser("~/.opencode-tts/telegram-watch-state.json")

with open(CONFIG, encoding="utf-8") as f:
    cfg = json.load(f)

TOKEN = cfg["token"]
CHANNEL = cfg["channel"]
DISCUSSION = int(cfg["discussion_group"]) if cfg.get("discussion_group") else None

BASE = f"https://api.telegram.org/bot{TOKEN}"


def get_updates(offset=0):
    r = requests.get(f"{BASE}/getUpdates", params={
        "offset": offset, "timeout": 10,
        "allowed_updates": json.dumps(["message", "channel_post"]),
    }, timeout=15)
    return r.json().get("result", [])


def get_last_update_id():
    try:
        with open(STATE_FILE) as f:
            return json.load(f).get("last_update_id", 0)
    except:
        return 0


def save_last_update_id(uid):
    with open(STATE_FILE, "w") as f:
        json.dump({"last_update_id": uid, "updated_at": datetime.now().isoformat()}, f)


def get_comment_link(message):
    """Return a link to the commented post if possible."""
    if hasattr(message, 'get') and message.get("is_topic_message"):
        thread_id = message.get("message_thread_id")
        msg_id = message.get("message_id")
        # channel post link format: https://t.me/c/{chat_id}/{thread_id}?thread={msg_id}
        chat_id_str = str(DISCUSSION if DISCUSSION else CHANNEL).replace("-100", "")
        return f"t.me/c/{chat_id_str}/{thread_id}?thread={msg_id}"
    return None


def check_comments(offset=0):
    updates = get_updates(offset)
    comments = []
    for update in updates:
        msg = update.get("message") or update.get("channel_post")
        if not msg:
            continue
        chat_id = msg["chat"]["id"]
        # Only from discussion group
        if DISCUSSION and chat_id != DISCUSSION:
            continue
        if not DISCUSSION and chat_id == CHANNEL:
            continue

        text = msg.get("text") or msg.get("caption") or ""
        if not text:
            continue

        from_user = msg.get("from", {})
        name = from_user.get("first_name", "") + " " + (from_user.get("last_name", "") or "")
        username = from_user.get("username", "")

        comments.append({
            "message_id": msg["message_id"],
            "chat_id": chat_id,
            "user": name.strip() or username or "unknown",
            "username": username,
            "text": text,
            "date": msg["date"],
            "thread_id": msg.get("message_thread_id"),
        })

    return updates, comments


def reply_to_message(chat_id, message_id, text):
    r = requests.post(f"{BASE}/sendMessage", json={
        "chat_id": chat_id,
        "text": text,
        "reply_to_message_id": message_id,
        "parse_mode": "HTML",
    }, timeout=10)
    return r.json().get("ok", False)


if __name__ == "__main__":
    if "--reply" in sys.argv:
        # Reply mode: read reply text from stdin
        chat_id = int(os.environ.get("TG_CHAT_ID", DISCUSSION or 0))
        msg_id = int(os.environ.get("TG_REPLY_TO", 0))
        text = sys.stdin.read().strip()
        if chat_id and msg_id and text:
            ok = reply_to_message(chat_id, msg_id, text)
            print("OK" if ok else "FAIL")
        else:
            print("Missing TG_CHAT_ID, TG_REPLY_TO, or stdin text")
        sys.exit(0)

    # Check mode: show recent comments
    offset = get_last_update_id()
    updates, comments = check_comments(offset)

    if not comments:
        print("NO_COMMENTS")
        if updates:
            save_last_update_id(max(u["update_id"] for u in updates) + 1)
        sys.exit(0)

    # Save latest update id
    if updates:
        save_last_update_id(max(u["update_id"] for u in updates) + 1)

    # Print comments as JSON
    print(json.dumps(comments, ensure_ascii=False, indent=2))
