"""
Telegram comment manager.
- check: shows pending comments
- reply <id> <text>: sends a reply (marks as replied)
"""
import json, os, requests, sys

PENDING_FILE = os.path.expanduser("~/.opencode-tts/pending-comments.json")
CONFIG = os.path.expanduser("~/.opencode-tts/telegram-config.json")
DISCUSSION_ID = -1003939462897


def load_pending():
    try:
        with open(PENDING_FILE, encoding="utf-8") as f:
            return json.load(f)
    except:
        return []


def save_pending(comments):
    with open(PENDING_FILE, "w", encoding="utf-8") as f:
        json.dump(comments, f, ensure_ascii=False, indent=2)


def reply(chat_id, message_id, text):
    cfg = json.load(open(CONFIG, encoding="utf-8"))
    r = requests.post(
        f"https://api.telegram.org/bot{cfg['token']}/sendMessage",
        json={"chat_id": chat_id, "text": text,
              "reply_to_message_id": message_id, "parse_mode": "HTML"},
        timeout=10
    )
    return r.json().get("ok", False)


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "reply":
        msg_id = int(sys.argv[2])
        text = sys.argv[3] if len(sys.argv) > 3 else sys.stdin.read().strip()

        pending = load_pending()
        comment = next((c for c in pending if c["id"] == msg_id), None)
        if not comment:
            print(f"Comment {msg_id} not found in pending")
            sys.exit(1)

        ok = reply(DISCUSSION_ID, msg_id, text)
        if ok:
            comment["replied"] = True
            comment["reply_text"] = text
            save_pending(pending)
            print(f"OK: replied to msg {msg_id}")
        else:
            print("FAIL")
        sys.exit(0)

    if len(sys.argv) >= 3 and sys.argv[1] == "delete":
        msg_id = int(sys.argv[2])
        pending = load_pending()
        pending = [c for c in pending if c["id"] != msg_id]
        save_pending(pending)
        print(f"Deleted msg {msg_id}")
        sys.exit(0)

    # Default: show pending
    pending = load_pending()
    unreplied = [c for c in pending if not c.get("replied")]
    if unreplied:
        print(json.dumps(unreplied, ensure_ascii=False, indent=2))
    else:
        print("NO_COMMENTS")
