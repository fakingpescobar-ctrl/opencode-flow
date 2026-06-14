import sys
import os
import json
import time
import logging
import queue
import tempfile
import threading
import ctypes
from pathlib import Path

from flask import Flask, request, jsonify
from waitress import serve

from tts_config import load_config
from backend_elevenlabs import ElevenLabsBackend

TTS_STATUS_PATH = Path.home() / ".opencode-tts" / "tts-status.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("tts_server")

backend = None
_tts_state = "offline"
_tts_lock = threading.RLock()
app = Flask(__name__)


def _write_tts_status(state: str):
    """Пишет статус TTS в tts-status.json для оверлея."""
    global _tts_state
    with _tts_lock:
        _tts_state = state
    try:
        TTS_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps({"state": state, "ts": time.time()}, ensure_ascii=False)
        with open(TTS_STATUS_PATH, "w", encoding="utf-8") as f:
            f.write(payload)
    except Exception:
        pass

# ── Воспроизведение mp3 через MCI (winmm), очередью в фоне ──────
_play_queue: "queue.Queue[str]" = queue.Queue()


def _mci(cmd: str) -> int:
    """Отправляет MCI-команду. Возвращает код ошибки (0 = успех)."""
    return ctypes.windll.winmm.mciSendStringW(cmd, None, 0, 0)


def _play_mp3(path: str):
    alias = "ttsclip"
    _mci(f"close {alias}")
    err = _mci(f'open "{path}" type mpegvideo alias {alias}')
    if err != 0:
        # запасной путь: без указания типа устройства
        err = _mci(f'open "{path}" alias {alias}')
    if err != 0:
        buf = ctypes.create_unicode_buffer(256)
        ctypes.windll.winmm.mciGetErrorStringW(err, buf, 256)
        log.error(f"MCI open failed ({err}): {buf.value}")
        return
    _mci(f"play {alias} wait")
    _mci(f"close {alias}")


def _playback_worker():
    while True:
        path = _play_queue.get()
        try:
            _play_mp3(path)
        except Exception:
            log.exception("Ошибка воспроизведения")
        finally:
            try:
                os.remove(path)
            except Exception:
                pass
            _play_queue.task_done()


threading.Thread(target=_playback_worker, daemon=True).start()


def enqueue_play(audio_data: bytes):
    """Сохраняет mp3 во временный файл и ставит в очередь на проигрывание."""
    fd, path = tempfile.mkstemp(suffix=".mp3", prefix="tts_")
    with os.fdopen(fd, "wb") as f:
        f.write(audio_data)
    _play_queue.put(path)


def init_backend():
    global backend
    _write_tts_status("loading")
    cfg = load_config()
    model_key = cfg.get("model_key", "none")

    if model_key == "none":
        log.error("TTS отключён (model_key=none). Запуск невозможен.")
        sys.exit(1)

    if model_key == "elevenlabs":
        ecfg = cfg.get("elevenlabs", {})
        api_key = ecfg.get("api_key", "")
        if not api_key:
            log.error("Не указан API-ключ ElevenLabs в config.json")
            _write_tts_status("error")
            sys.exit(1)
        backend = ElevenLabsBackend(
            api_key=api_key,
            voice_id=ecfg.get("voice_id", ""),
            model=ecfg.get("model", "eleven_multilingual_v2"),
            stability=ecfg.get("stability", 0.5),
            similarity_boost=ecfg.get("similarity_boost", 0.75),
            style=ecfg.get("style", 0.0),
            speed=ecfg.get("speed", 1.0),
        )
        log.info("Бэкенд ElevenLabs инициализирован")
        _write_tts_status("ready")
    else:
        log.error(f"Неизвестная модель: {model_key}")
        _write_tts_status("error")
        sys.exit(1)


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/tts", methods=["POST"])
def tts_handler():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "invalid JSON"}), 400

    text = body.get("text", "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    try:
        _write_tts_status("speaking")
        audio_data = backend.synthesize(text)
        enqueue_play(audio_data)
        _write_tts_status("ready")
        return app.response_class(
            response=audio_data,
            status=200,
            mimetype="audio/mpeg",
        )
    except Exception as e:
        _write_tts_status("error")
        log.exception("Ошибка синтеза")
        return jsonify({"error": str(e)}), 500


def _keepalive_worker():
    """Держит соединение с ElevenLabs тёплым: дешёвый пинг каждые 20с.
    Без этого после паузы первый синтез ждёт переустановки TLS через туннель (~4с)."""
    while True:
        time.sleep(10)
        try:
            if backend is not None:
                backend.client.models.list()
        except Exception:
            log.warning("Keepalive пинг не удался")
        _write_tts_status("ready")


def _watchtower_worker():
    """Проверяет здоровье бэкенда каждые 30с. Если бэкенд упал (сеть/VPN
    отвалился) — пересоздаёт клиент со свежим пулом соединений."""
    while True:
        time.sleep(30)
        try:
            if backend is not None and not backend._healthy:
                log.info("Watchtower: бэкенд нездоров, пересоздаю клиент")
                backend.client = backend._new_client()
                # пробный пинг
                backend.client.models.list()
                backend._healthy = True
                log.info("Watchtower: бэкенд восстановлен")
                _write_tts_status("ready")
        except Exception:
            log.warning("Watchtower: бэкенд всё ещё недоступен")


def main():
    init_backend()
    threading.Thread(target=_keepalive_worker, daemon=True).start()
    threading.Thread(target=_watchtower_worker, daemon=True).start()
    log.info("TTS сервер запущен на 127.0.0.1:4321")
    _write_tts_status("ready")
    try:
        serve(app, host="127.0.0.1", port=4321)
    except Exception:
        _write_tts_status("error")
        raise


if __name__ == "__main__":
    main()
