import json
import os
from pathlib import Path

CONFIG_DIR = Path.home() / ".opencode-tts"
CONFIG_PATH = CONFIG_DIR / "config.json"

AVAILABLE_MODELS = {
    "elevenlabs": {
        "name": "ElevenLabs",
        "description": "Облачный TTS от ElevenLabs, ~20 языков",
    },
    "none": {
        "name": "Без TTS",
        "description": "Отключить озвучку ответов",
    },
}

DEFAULT_CONFIG = {
    "model_key": "none",
    "elevenlabs": {
        "api_key": "",
        "voice_id": "vpUqfpCIn34tjFW4KHjt",
        "model": "eleven_multilingual_v2",
        "stability": 0.5,
        "similarity_boost": 0.75,
        "style": 0.0,
        "speed": 1.0,
    },
}


def load_config():
    if not CONFIG_PATH.exists():
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        save_config(DEFAULT_CONFIG)
        return dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return dict(DEFAULT_CONFIG)


def save_config(cfg):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
