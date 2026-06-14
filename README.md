<div align="center">
  <img src="logo.svg" width="400" alt="opencode-flow logo">
</div>

# opencode-flow

Голосовой ввод (Whisper STT) + Озвучка ответов (ElevenLabs TTS) + Управление Яндекс Музыкой + Telegram-канал с AI-автоответом для [OpenCode](https://opencode.ai).

---

## Структура

```
opencode-flow/
├── tts-server/              # TTS-сервер (ElevenLabs)
│   ├── tts_server.py            # Flask на waitress, порт 4321
│   ├── backend_elevenlabs.py    # Обёртка ElevenLabs SDK
│   ├── tts_config.py            # Загрузка конфига
│   └── start-tts.ps1            # Меню выбора TTS
├── whisper/                 # Голосовой ввод
│   ├── whisper_listener.py      # VAD + faster-whisper + SendInput
│   ├── run-whisper.ps1          # Авторестарт-обёртка
│   └── start-voice.ps1          # Запуск whisper + оверлеев
├── overlays/                # Плавающие индикаторы
│   ├── status_overlay.py        # Статус Whisper
│   ├── tts_overlay.py           # Статус TTS
│   └── telegram_overlay.py      # Статус Telegram бота
├── ym-control/              # Управление Яндекс Музыкой через CDP
│   ├── media-control.ps1        # Обёртка: next, prev, playpause, like, volume
│   ├── ym_control.exe           # C# программа (базовые действия)
│   ├── start-ym-debug.ps1       # Запуск YM с remote-debugging-port
│   ├── ym-like-v11.mjs          # Лайк трека через API Яндекса
│   ├── ym-check-fav-api.mjs     # Проверка лайкнутых
│   └── ... (другие .mjs скрипты)
├── plugin/                  # Плагин OpenCode
│   └── tts.ts                   # Автозапуск всего, мониторинг, автоозвучка
└── tools/                   # Telegram-инструменты
    ├── post-telegram.py         # Постинг в канал (текст/фото)
    ├── telegram-watch.py        # Просмотр и ручной ответ на комментарии
    ├── telegram-watch-daemon.py # Фоновый daemon с LLM-автоответом
    └── telegram-watch-daemon.py # Мониторинг комментариев
```

---

## Компоненты

### TTS (ElevenLabs)

```bash
tts-server/tts_server.py
```

Flask-сервер на `waitress`, порт **4321**. Единственный бэкенд — ElevenLabs.

- Воспроизведение mp3 через MCI (`winmm.dll`) с фоновой очередью
- Keepalive-воркер — пинг `/v1/models` каждые 20 с
- Watchtower-воркер — проверка соединения каждые 30 с, пересоздание клиента
- Статус в `~/.opencode-tts/tts-status.json`: `loading` / `ready` / `speaking` / `error`

**Зависимости (Conda env `elevenlabs`):** `flask, waitress, elevenlabs, requests`

---

### Voice Input (Whisper STT)

```bash
whisper/whisper_listener.py
```

VAD (энергетический) + `faster-whisper medium` на CUDA. Ввод текста через `SendInput`.

- Фильтр галлюцинаций (стоп-фразы, короткий/повторяющийся текст)
- Typewriter-режим с задержкой 40 мс
- Горячие клавиши: **Ctrl+Shift+V** (пауза), **Ctrl+Shift+Q** (выход)
- Автоматически замолкает, когда TTS говорит

**Зависимости (Conda env `chatterbox-tts`):** `faster-whisper, sounddevice, numpy, pynput`

---

### Оверлеи

Три плавающих индикатора, прикреплённых к окну Windows Terminal:

| Оверлей | Файл | Статусы |
|---------|------|---------|
| Whisper | `overlays/status_overlay.py` | слушает / печатает / пауза / offline |
| TTS | `overlays/tts_overlay.py` | загрузка / готов / озвучивает / ошибка |
| Telegram | `overlays/telegram_overlay.py` | загрузка / готов / отвечает / ошибка |

Автоподъём при падении — вотчдоги в `tts.ts`.

---

### Telegram-канал и AI-автоответ

```bash
tools/post-telegram.py "текст"                    # Пост в канал
tools/post-telegram.py --photo "путь" "подпись"   # Пост с фото
tools/telegram-watch.py                            # Посмотреть pending комментарии
```

Фоновый daemon (`telegram-watch-daemon.py`) каждые 10 с проверяет комментарии в обсуждении канала и отвечает на новые через локальный LLM (Ollama).

**Как работает:**
1. Daemon висит в фоне, запускается плагином `tts.ts` при старте OpenCode
2. Новый комментарий → генерация ответа через Ollama (Impish_Bloodmoon_12B)
3. Ответ отправляется в тред обсуждения
4. Комментарий сохраняется в `pending-comments.json` для истории

**Стиль ответов:** казахский подросток, русский с редкими казахскими словами, зеркалит настроение собеседника. Если девушка флиртует — подкатывает в ответ. Если грубят — грубит в ответ.

**Канал:** [@GanggBanny](https://t.me/GanggBanny)
**Бот:** @opencode_flow_bot

---

### Управление Яндекс Музыкой

```bash
ym-control/media-control.ps1 -Action <next|prev|playpause|right|left|like|mute|restart|volume_N>
```

Управление через CDP (Chrome DevTools Protocol). YM запускается с `--remote-debugging-port=9222`.

**Лайк трека** — через прямой API Яндекса (`POST /users/{uid}/likes/tracks/add-multiple`), так как UI-селекторы нестабильны.

---

### Плагин OpenCode

```bash
plugin/tts.ts
```

Устанавливается в `~/.config/opencode/plugin/tts.ts`.

При старте OpenCode:
1. Запускает Telegram daemon + оверлей
2. Запускает Whisper listener + оверлей
3. Запускает TTS-сервер + оверлей (если выбран не `none`)
4. Автоозвучка русских ответов ассистента
5. Очистка процессов при выходе

---

## Установка

### 1. Python-окружения (Conda)

```powershell
# TTS (ElevenLabs)
conda create -n elevenlabs python=3.11
conda activate elevenlabs
pip install flask waitress elevenlabs requests

# Whisper + Оверлеи + Telegram
conda create -n chatterbox-tts python=3.11
conda activate chatterbox-tts
pip install faster-whisper sounddevice numpy pynput requests
```

### 2. Ollama + LLM для автоответа

```powershell
ollama pull hf.co/mradermacher/Impish_Bloodmoon_12B-i1-GGUF:Q4_K_M
```

### 3. Плагин OpenCode

```powershell
copy plugin\tts.ts "$env:USERPROFILE\.config\opencode\plugin\tts.ts"
```

### 4. Конфиги Telegram

```powershell
# ~/.opencode-tts/telegram-config.json
{
  "token": "BOT_TOKEN",
  "channel": "@GanggBanny",
  "channel_id": -1003300506997,
  "discussion_group": -1003939462897
}
```

### 5. Яндекс Музыка

```powershell
ym-control/start-ym-debug.ps1
ym-control/media-control.ps1 next
```

---

## Быстрый старт

```powershell
# 1. Запустить YM с debug-портом
ym-control/start-ym-debug.ps1

# 2. Запустить OpenCode — плагин поднимет всё остальное
opencode
```

Плагин автоматически запустит TTS (если настроен), Whisper, Telegram daemon и все оверлеи.

---

## Важные детали

- **Яндекс Музыка** — Electron с кастомным протоколом `music-application://`. CDP только через Node.js WebSocket.
- **Лайк через API:** `POST https://api.music.yandex.net/users/{uid}/likes/tracks/add-multiple` с form-urlencoded и OAuth-токеном из `localStorage`.
- **Network recovery:** ElevenLabs при блокировке (РФ) — watchtower проверяет каждые 30 с, восстанавливается после включения VPN.
- **Telegram daemon** пишет статус в `~/.opencode-tts/telegram-status.json` для оверлея.

---

## Лицензия

MIT
