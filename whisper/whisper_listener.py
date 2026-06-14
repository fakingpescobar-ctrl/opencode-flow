"""
Фоновый голосовой ввод для OpenCode.

VAD (энергетический) + faster-whisper + WriteConsoleInputW.

Горячие клавиши:
    Ctrl+Shift+V — вкл/выкл прослушивание
    Ctrl+Shift+Q — выход

Запуск:
    conda run -n chatterbox-tts python whisper_listener.py
    conda run -n chatterbox-tts python whisper_listener.py --debug   # отд.окно VAD-диагностики
"""

import os
import sys
import time
import faulthandler
import threading
import queue
import json
import logging
import ctypes
from ctypes import wintypes
from collections import deque
from pathlib import Path
from threading import Lock

import numpy as np
import sounddevice as sd
from pynput import keyboard as kb_ctrl

from faster_whisper import WhisperModel

VOICE_CONFIG_PATH = Path.home() / ".opencode-tts" / "voice-config.json"

def _load_voice_config() -> dict:
    default_config = {
        "whisper_model_size": "medium",
        "whisper_device": "cuda",
        "whisper_compute": "float16",
        "language": "ru",
        "beam_size": 5,
        "vad_threshold": 0.005,
        "min_chunk_energy": 0.005,
        "silence_duration_sec": 1.5,
        "min_speech_duration_sec": 0.5,
        "pre_speech_duration_sec": 0.3,
        "send_cooldown_sec": 5.0,
        "auto_enter": True,
        "huggingface_offline": True,
        "typewriter_enabled": True,
        "typewriter_delay_ms": 40,
    }
    try:
        if VOICE_CONFIG_PATH.exists():
            with open(VOICE_CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            default_config.update(cfg)
    except Exception:
        pass
    return default_config

CFG = _load_voice_config()

# --- Статус для плагина opencode и оверлея (живая индикация) ---
VOICE_STATUS_PATH = Path.home() / ".opencode-tts" / "voice-status.json"
TTS_STATUS_PATH = Path.home() / ".opencode-tts" / "tts-status.json"
_status_state = "loading"
_status_text = ""

def _is_tts_speaking() -> bool:
    try:
        if TTS_STATUS_PATH.exists():
            with open(TTS_STATUS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("state") == "speaking"
    except Exception:
        pass
    return False

def _write_status(state: str, text: str = ""):
    """Атомарно пишет текущее состояние. Плагин/оверлей опрашивают файл."""
    global _status_state, _status_text
    _status_state, _status_text = state, text
    try:
        VOICE_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps({"state": state, "text": text[:80], "ts": time.time()}, ensure_ascii=False)
        tmp = VOICE_STATUS_PATH.with_suffix(".json.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(payload)
        os.replace(tmp, VOICE_STATUS_PATH)
    except Exception:
        pass

def _refresh_status():
    """Heartbeat: переписывает текущее состояние со свежим ts, чтобы оверлей
    видел, что слушатель жив (иначе показывает offline)."""
    _write_status(_status_state, _status_text)

DEBUG = "--debug" in sys.argv
if DEBUG:
    _kc = ctypes.windll.kernel32
    _kc.AllocConsole()
    _kc.SetConsoleTitleW("VAD Debug")
    _dbg_h = _kc.GetStdHandle(-11)
    _kc.WriteConsoleW.argtypes = [wintypes.HANDLE, wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), wintypes.LPVOID]
    _kc.WriteConsoleW.restype = wintypes.BOOL

def _dbg(s, end="\n"):
    if DEBUG:
        try:
            msg = s + end
            n = wintypes.DWORD(0)
            _kc.WriteConsoleW(_dbg_h, msg, len(msg), ctypes.byref(n), None)
        except Exception:
            pass

if sys.stdout is not None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

LOG_FILE = Path.home() / ".opencode-tts" / "voice-listener.log"
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

_fault_log = str(LOG_FILE.parent / "whisper_crash.log")
_fh = open(_fault_log, "w")
faulthandler.enable(file=_fh)

# Redirect stdout/stderr so that print() survives FreeConsole()
_teed_stdout = open(os.devnull, "w", encoding="utf-8")
sys.stdout = _teed_stdout
sys.stderr = _teed_stdout

def _kill_older_copies():
    import subprocess
    my_pid = os.getpid()
    my_is_debug = "--debug" in sys.argv
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f"Get-CimInstance Win32_Process | "
             f"Where-Object {{ "
             f"  $_.Name -match '^python' -and "
             f"  $_.CommandLine -match 'whisper_listener' -and "
             f"  $_.ProcessId -ne {my_pid} "
              f"  {'-and $_.CommandLine -match ''--debug''' if my_is_debug else ''} "
             f"}} | "
             f"ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }}"],
            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except Exception:
        pass

_kill_older_copies()

class _FlushFileHandler(logging.FileHandler):
    def emit(self, record):
        super().emit(record)
        self.flush()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        _FlushFileHandler(str(LOG_FILE), encoding="utf-8", mode="w"),
    ],
)
log = logging.getLogger("voice")
logging.getLogger("huggingface_hub").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

WHISPER_MODEL_SIZE = CFG["whisper_model_size"]
WHISPER_DEVICE = CFG["whisper_device"]
WHISPER_COMPUTE = CFG["whisper_compute"]

SAMPLE_RATE = 16000
CHANNELS = 1
DTYPE = "float32"
FRAME_DURATION = 0.03
CHUNK_SIZE = int(SAMPLE_RATE * FRAME_DURATION)

SILENCE_DURATION_SEC = CFG["silence_duration_sec"]
SILENCE_CHUNKS = int(SILENCE_DURATION_SEC / FRAME_DURATION)
MIN_SPEECH_DURATION_SEC = CFG["min_speech_duration_sec"]
MIN_SPEECH_CHUNKS = int(MIN_SPEECH_DURATION_SEC / FRAME_DURATION)
PRE_SPEECH_DURATION_SEC = CFG["pre_speech_duration_sec"]
PRE_SPEECH_CHUNKS = int(PRE_SPEECH_DURATION_SEC / FRAME_DURATION)

VAD_THRESHOLD = CFG["vad_threshold"]
MIN_CHUNK_ENERGY = CFG["min_chunk_energy"]

if CFG["huggingface_offline"]:
    os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
    os.environ["HF_HUB_OFFLINE"] = "1"

is_active = True
pressed_keys: set = set()
last_transcribe_time = 0.0
last_send_time = 0.0

def is_modifier(k):
    return k in (kb_ctrl.Key.ctrl, kb_ctrl.Key.ctrl_l, kb_ctrl.Key.ctrl_r,
                 kb_ctrl.Key.shift, kb_ctrl.Key.shift_l, kb_ctrl.Key.shift_r)

def has_hotkey(char_lower: str) -> bool:
    has_ctrl = any(k in (kb_ctrl.Key.ctrl, kb_ctrl.Key.ctrl_l, kb_ctrl.Key.ctrl_r) for k in pressed_keys)
    has_shift = any(k in (kb_ctrl.Key.shift, kb_ctrl.Key.shift_l, kb_ctrl.Key.shift_r) for k in pressed_keys)
    has_char = any(str(k).strip("'\"") == char_lower for k in pressed_keys)
    return has_ctrl and has_shift and has_char

_write_status("loading")
log.info(f"Загружаю Whisper ({WHISPER_MODEL_SIZE}) на {WHISPER_DEVICE}...")
print(f"Загружаю Whisper ({WHISPER_MODEL_SIZE}) на {WHISPER_DEVICE}...", flush=True)
whisper = WhisperModel(
    WHISPER_MODEL_SIZE,
    device=WHISPER_DEVICE,
    compute_type=WHISPER_COMPUTE,
)
_whisper_lock = Lock()
log.info("Whisper готов")
print("Whisper готов", flush=True)

audio_queue: queue.Queue = queue.Queue()

_cb_count = 0
def audio_callback(indata, frames, time_info, status):
    global _cb_count
    _cb_count += 1
    if status:
        log.warning(f"mic: {status}")
        print(f"mic status: {status}", flush=True)
    try:
        audio_queue.put(indata.copy())
    except Exception as e:
        log.error(f"audio_callback error: {e}")
        print(f"audio_callback error: {e}", flush=True)

stream = sd.InputStream(
    samplerate=SAMPLE_RATE,
    channels=CHANNELS,
    dtype=DTYPE,
    blocksize=CHUNK_SIZE,
    callback=audio_callback,
)

AUTO_ENTER = CFG["auto_enter"]
SEND_COOLDOWN_SEC = CFG["send_cooldown_sec"]

VK_RETURN = 0x0D

def _find_opencode_pids():
    """Return list of opencode.exe PIDs via WMI."""
    import subprocess, json as _json
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-CimInstance Win32_Process -Filter \"Name = 'opencode.exe'\" "
             "| Select-Object ProcessId | ConvertTo-Json"],
            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        if r.returncode == 0 and r.stdout.strip():
            data = _json.loads(r.stdout)
            if isinstance(data, dict):
                data = [data]
            return [e["ProcessId"] for e in data]
    except Exception as e:
        log.warning(f"[PIDS] exception: {e}")
    return []

def _log_tui_hwnd():
    """Log the TUI console HWND for debugging."""
    kernel32 = ctypes.windll.kernel32
    user32 = ctypes.windll.user32
    opencode_pids = _find_opencode_pids()
    for pid in opencode_pids:
        try:
            kernel32.FreeConsole()
            if kernel32.AttachConsole(pid):
                hwnd = kernel32.GetConsoleWindow()
                kernel32.FreeConsole()
                if hwnd and user32.IsWindowVisible(hwnd):
                    log.info(f"TUI HWND: {hwnd} (console of opencode PID {pid})")
                    return
        except Exception:
            pass
        finally:
            kernel32.AttachConsole(-1)

KEY_EVENT = 0x0001

class KEY_EVENT_RECORD(ctypes.Structure):
    _fields_ = [
        ('bKeyDown', wintypes.BOOL),
        ('wRepeatCount', wintypes.WORD),
        ('wVirtualKeyCode', wintypes.WORD),
        ('wVirtualScanCode', wintypes.WORD),
        ('uChar', wintypes.WCHAR),
        ('dwControlKeyState', wintypes.DWORD),
    ]

class INPUT_RECORD(ctypes.Structure):
    _fields_ = [
        ('EventType', wintypes.WORD),
        ('Event', KEY_EVENT_RECORD),
    ]

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_READ = 0x00000001
FILE_SHARE_WRITE = 0x00000002
OPEN_EXISTING = 3
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value


def _write_conin(text: str) -> bool:
    """Пишет текст напрямую в консольный буфер opencode через WriteConsoleInputW.
    Не требует фокуса — работает даже когда активна игра или окно свёрнуто."""
    if DEBUG:
        return False
    kernel32 = ctypes.windll.kernel32
    pids = _find_opencode_pids()
    if not pids:
        return False
    pid = pids[0]
    kernel32.FreeConsole()
    try:
        if not kernel32.AttachConsole(pid):
            log.warning(f"[WriteConIn] AttachConsole({pid}) failed")
            return False
        hConIn = kernel32.CreateFileW(
            "CONIN$",
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None, OPEN_EXISTING, 0, None,
        )
        if hConIn == INVALID_HANDLE_VALUE or hConIn == 0:
            log.warning("[WriteConIn] CONIN$ open failed")
            return False
        try:
            records = []
            for ch in text:
                if ch in ('\r', '\n'):
                    continue
                for down in (True, False):
                    r = INPUT_RECORD()
                    r.EventType = KEY_EVENT
                    r.Event.bKeyDown = down
                    r.Event.wRepeatCount = 1
                    r.Event.wVirtualKeyCode = 0
                    r.Event.wVirtualScanCode = 0
                    r.Event.uChar = ch
                    r.Event.dwControlKeyState = 0
                    records.append(r)
            if AUTO_ENTER:
                for down in (True, False):
                    r = INPUT_RECORD()
                    r.EventType = KEY_EVENT
                    r.Event.bKeyDown = down
                    r.Event.wRepeatCount = 1
                    r.Event.wVirtualKeyCode = VK_RETURN
                    r.Event.wVirtualScanCode = 0x1C
                    r.Event.uChar = '\r'
                    r.Event.dwControlKeyState = 0
                    records.append(r)
            arr = (INPUT_RECORD * len(records))(*records)
            written = wintypes.DWORD(0)
            ok = kernel32.WriteConsoleInputW(hConIn, arr, len(records), ctypes.byref(written))
            log.info(f"[WriteConIn] ok={ok} written={written.value}/{len(records)}")
            return bool(ok)
        finally:
            kernel32.CloseHandle(hConIn)
    except Exception as exc:
        log.warning(f"[WriteConIn] error: {exc}")
        return False
    finally:
        kernel32.FreeConsole()

_console_lock = Lock()

# --- Ввод текста через SendInput (юникод-нажатия в активное окно) ---
# Для отправки непосредственно в окно OpenCode (даже когда активна игра):
#   conhost → PostMessage(WM_CHAR) без смены фокуса
#   Windows Terminal → временный SetForegroundWindow + SendInput + возврат фокуса

_user32 = ctypes.windll.user32

# --- Поиск HWND консольного окна OpenCode ---
WM_CHAR    = 0x0102
WM_KEYDOWN = 0x0100
WM_KEYUP   = 0x0101

_hwnd_lock = Lock()
_opencode_hwnd_cache: int | None = None
_opencode_hwnd_cache_time: float = 0.0
_HWND_CACHE_TTL = 10.0


def _get_window_class(hwnd: int) -> str:
    buf = ctypes.create_unicode_buffer(256)
    _user32.GetClassNameW(hwnd, buf, 256)
    return buf.value


def _find_terminal_hwnd_for_pid(opencode_pid: int) -> int | None:
    """Найти видимое окно терминала (WinTerm / conhost) по цепочке предков opencode."""
    import subprocess as _sp, json as _json
    try:
        r = _sp.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command",
             f"$chain=@(); $cur={opencode_pid}; "
             f"1..8 | %{{ $p=Get-CimInstance Win32_Process -Filter \"ProcessId=$cur\" 2>$null; "
             f"if (!$p){{return}}; $chain+=[int]$p.ProcessId; $cur=$p.ParentProcessId }}; "
             f"$chain | ConvertTo-Json -Compress"],
            stdin=_sp.DEVNULL, capture_output=True, text=True, timeout=8,
            creationflags=_sp.CREATE_NO_WINDOW,
        )
        raw = r.stdout.strip()
        data = _json.loads(raw) if raw else []
        ancestor_pids = set(data if isinstance(data, list) else [data])
    except Exception as exc:
        log.warning(f"[HWND] ancestor lookup: {exc}")
        ancestor_pids = {opencode_pid}

    log.info(f"[HWND] ancestor PIDs for {opencode_pid}: {ancestor_pids}")

    found = [0]
    _TERMINAL_CLASSES = {"ConsoleWindowClass", "CASCADIA_HOSTING_WINDOW_CLASS"}

    def _cb(hwnd, _lparam):
        if not _user32.IsWindowVisible(hwnd):
            return True
        pid_out = wintypes.DWORD(0)
        _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid_out))
        if pid_out.value in ancestor_pids:
            if _get_window_class(hwnd) in _TERMINAL_CLASSES:
                found[0] = hwnd
                return False
        return True

    _WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    _user32.EnumWindows(_WNDENUMPROC(_cb), 0)

    if found[0]:
        log.info(f"[HWND] terminal HWND={found[0]} cls={_get_window_class(found[0])!r}")
    else:
        log.warning(f"[HWND] visible terminal window not found for PID {opencode_pid}")
    return found[0] or None


def _find_opencode_hwnd() -> int | None:
    """HWND окна opencode: conhost (видимый) или Windows Terminal через предков процесса."""
    if DEBUG:
        return None  # в debug-режиме у нас своя консоль — не трогаем
    kernel32 = ctypes.windll.kernel32
    pids = _find_opencode_pids()
    for pid in pids:
        kernel32.FreeConsole()
        try:
            if kernel32.AttachConsole(pid):
                hwnd = kernel32.GetConsoleWindow()
                if hwnd and _user32.IsWindowVisible(hwnd):
                    cls = _get_window_class(hwnd)
                    log.info(f"[HWND] visible conhost HWND={hwnd} cls={cls!r} pid={pid}")
                    return hwnd
                if hwnd:
                    log.info(f"[HWND] invisible {hwnd} cls={_get_window_class(hwnd)!r} pid={pid} → ищу терминал")
        except Exception as exc:
            log.warning(f"[HWND] ошибка для pid {pid}: {exc}")
        finally:
            kernel32.FreeConsole()
        hwnd = _find_terminal_hwnd_for_pid(pid)
        if hwnd:
            return hwnd
    return None


def _get_opencode_hwnd() -> int | None:
    """Кэшированный HWND окна opencode (TTL {_HWND_CACHE_TTL}s)."""
    global _opencode_hwnd_cache, _opencode_hwnd_cache_time
    now = time.time()
    with _hwnd_lock:
        if now - _opencode_hwnd_cache_time > _HWND_CACHE_TTL:
            _opencode_hwnd_cache = _find_opencode_hwnd()
            _opencode_hwnd_cache_time = now
        return _opencode_hwnd_cache


_PUL = ctypes.POINTER(ctypes.c_ulong)

INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004


class _KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", _PUL),
    ]


class _MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", _PUL),
    ]


class _HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    ]


class _INPUT_UNION(ctypes.Union):
    _fields_ = [("ki", _KEYBDINPUT), ("mi", _MOUSEINPUT), ("hi", _HARDWAREINPUT)]


class _INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", _INPUT_UNION)]


_INPUT_SIZE = ctypes.sizeof(_INPUT)


def _send_inputs(inputs):
    arr = (_INPUT * len(inputs))(*inputs)
    _user32.SendInput(len(inputs), arr, _INPUT_SIZE)


def _char_inputs(ch: str):
    code = ord(ch)
    down = _INPUT(type=INPUT_KEYBOARD,
                  u=_INPUT_UNION(ki=_KEYBDINPUT(0, code, KEYEVENTF_UNICODE, 0, None)))
    up = _INPUT(type=INPUT_KEYBOARD,
                u=_INPUT_UNION(ki=_KEYBDINPUT(0, code, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, None)))
    return [down, up]


def _enter_inputs():
    down = _INPUT(type=INPUT_KEYBOARD,
                  u=_INPUT_UNION(ki=_KEYBDINPUT(VK_RETURN, 0, 0, 0, None)))
    up = _INPUT(type=INPUT_KEYBOARD,
                u=_INPUT_UNION(ki=_KEYBDINPUT(VK_RETURN, 0, KEYEVENTF_KEYUP, 0, None)))
    return [down, up]


def _do_send_input(text: str):
    """SendInput в текущее активное окно. Вызывать только под _console_lock."""
    typewriter = CFG.get("typewriter_enabled", True)
    delay_s = CFG["typewriter_delay_ms"] / 1000.0
    try:
        if typewriter:
            for i, ch in enumerate(text):
                if ch in ("\r", "\n"):
                    continue
                _send_inputs(_char_inputs(ch))
                if i < len(text) - 1:
                    time.sleep(delay_s)
        else:
            batch = []
            for ch in text:
                if ch in ("\r", "\n"):
                    continue
                batch.extend(_char_inputs(ch))
            if batch:
                _send_inputs(batch)
        if AUTO_ENTER:
            time.sleep(0.05)
            _send_inputs(_enter_inputs())
            log.info("[SendInput] Enter sent")
    except Exception as exc:
        log.warning(f"[SendInput] error: {exc}")


def _do_post_conhost(hwnd: int, text: str):
    """PostMessage WM_CHAR в conhost-окно — не требует фокуса. Вызывать под _console_lock."""
    typewriter = CFG.get("typewriter_enabled", True)
    delay_s = CFG["typewriter_delay_ms"] / 1000.0
    try:
        for i, ch in enumerate(text):
            if ch in ("\r", "\n"):
                continue
            _user32.PostMessageW(hwnd, WM_CHAR, ord(ch), 1)
            if typewriter and i < len(text) - 1:
                time.sleep(delay_s)
        if AUTO_ENTER:
            time.sleep(0.05)
            lp_down = 1 | (0x1C << 16)              # scan code Enter = 0x1C
            lp_up   = lp_down | (1 << 30) | (1 << 31)
            _user32.PostMessageW(hwnd, WM_KEYDOWN, VK_RETURN, lp_down)
            _user32.PostMessageW(hwnd, WM_KEYUP,   VK_RETURN, lp_up)
            log.info("[PostMessage] Enter sent to conhost")
    except Exception as exc:
        log.warning(f"[PostMessage] error: {exc}")


def _force_foreground(hwnd: int) -> int:
    """SetForegroundWindow надёжно из фонового процесса (AttachThreadInput).
    Возвращает HWND окна, которое реально получило фокус (может отличаться от hwnd)."""
    fg = _user32.GetForegroundWindow()
    if fg == hwnd:
        return hwnd
    fg_tid = _user32.GetWindowThreadProcessId(fg, None) if fg else 0
    my_tid = ctypes.windll.kernel32.GetCurrentThreadId()
    attached = False
    if fg_tid and fg_tid != my_tid:
        attached = bool(_user32.AttachThreadInput(my_tid, fg_tid, True))
    _user32.ShowWindow(hwnd, 9)          # SW_RESTORE на запрошенном окне
    _user32.SetForegroundWindow(hwnd)
    if attached:
        _user32.AttachThreadInput(my_tid, fg_tid, False)
    time.sleep(0.06)
    actual = _user32.GetForegroundWindow()
    # Для PseudoConsoleWindow фактически фокус получает хост-окно (Windows Terminal).
    # Если оно было свёрнуто — разворачиваем и его тоже.
    if actual and actual != hwnd:
        _user32.ShowWindow(actual, 9)
        time.sleep(0.04)
    return actual or hwnd


def _send_input_batch(text: str):
    """Отправляет весь текст одним вызовом SendInput — без задержек между символами.
    Вызывать только под _console_lock."""
    try:
        batch = []
        for ch in text:
            if ch in ("\r", "\n"):
                continue
            batch.extend(_char_inputs(ch))
        if batch:
            _send_inputs(batch)
        if AUTO_ENTER:
            time.sleep(0.05)
            _send_inputs(_enter_inputs())
            log.info("[SendInput] Enter sent (batch)")
    except Exception as exc:
        log.warning(f"[SendInput batch] error: {exc}")


def _post_chars(text: str):
    """Резервный метод: SendInput в активное окно."""
    with _console_lock:
        _do_send_input(text)


def _send_text_directed(text: str):
    """Направляет текст в окно OpenCode независимо от того, какое окно сейчас активно."""
    hwnd = _get_opencode_hwnd()
    cls  = _get_window_class(hwnd) if hwnd else ""

    with _console_lock:
        if not hwnd:
            log.warning("[DirectSend] opencode не найден → отправка в активное окно")
            _do_send_input(text)
        else:
            # Главный путь: WriteConsoleInputW напрямую в буфер — без фокуса, без мышки
            log.info(f"[DirectSend] WriteConIn attempt HWND={hwnd} cls={cls!r}")
            if not _write_conin(text):
                # Fallback: смена фокуса + SendInput
                log.warning("[DirectSend] WriteConIn failed → focus-switch fallback")
                prev_hwnd = _user32.GetForegroundWindow()
                try:
                    actual_fg = _force_foreground(hwnd)
                    log.info(f"[DirectSend] actual focus HWND={actual_fg}")
                    _send_input_batch(text)
                finally:
                    if prev_hwnd and prev_hwnd != hwnd:
                        time.sleep(0.03)
                        _force_foreground(prev_hwnd)
                        log.info(f"[DirectSend] фокус возвращён HWND={prev_hwnd}")


def send_text(text: str):
    if not text.strip():
        return
    # Не отправляем текст пока TTS говорит (чтобы не резать голосовой ответ)
    if _is_tts_speaking():
        log.info("[MUTE] TTS говорит — пропускаем")
        return
    # Whisper иногда галлюцинирует "$" (токен 258) из шума — отсекаем
    text = text.lstrip("$")
    if not text.strip():
        return
    try:
        _send_text_directed(text)
        preview = text[:80] + ("..." if len(text) > 80 else "")
        log.info(f"|> {preview}")
        print(f"|> {preview}", flush=True)
    except Exception:
        pass

# --- Фильтр галлюцинаций Whisper ---
# Whisper на тишине/шуме склонен «дорисовывать» типовые ютуб-фразы.
# Их нужно отбрасывать, чтобы они не попадали в поле ввода opencode.
HALLUCINATION_PHRASES = {
    "спасибо за просмотр",
    "спасибо за внимание",
    "подписывайтесь на канал",
    "подпишитесь на канал",
    "не забывайте подписываться",
    "ставьте лайки",
    "ставьте лайк и подписывайтесь",
    "увидимся в следующем видео",
    "увидимся в следующих видео",
    "до встречи в следующем видео",
    "продолжение следует",
    "субтитры сделал dimatorzok",
    "субтитры делал dimatorzok",
    "редактор субтитров",
    "корректор",
    "всем пока",
    "пока",
    "продолжение в следующем видео",
    "оставайтесь на связи",
    "пауза",
}

# Минимальная длина «осмысленного» текста.
MIN_TRANSCRIPT_CHARS = CFG.get("min_transcript_chars", 3)
MIN_TRANSCRIPT_WORDS = CFG.get("min_transcript_words", 1)


def _normalize_for_filter(text: str) -> str:
    """Нижний регистр, без пунктуации, схлопнутые пробелы — для сравнения."""
    cleaned = "".join(ch.lower() if (ch.isalnum() or ch.isspace()) else " " for ch in text)
    return " ".join(cleaned.split())


def is_hallucination(text: str) -> bool:
    """True, если текст — мусор/галлюцинация Whisper и слать его не надо."""
    norm = _normalize_for_filter(text)
    if not norm:
        return True
    if len(norm) < MIN_TRANSCRIPT_CHARS:
        return True
    words = norm.split()
    if len(words) < MIN_TRANSCRIPT_WORDS:
        return True
    # Точное совпадение со стоп-фразой.
    if norm in HALLUCINATION_PHRASES:
        return True
    # Короткая фраза, целиком состоящая из стоп-фразы как подстроки.
    if len(words) <= 6:
        for phrase in HALLUCINATION_PHRASES:
            if phrase in norm:
                return True
    # Один повторяющийся символ/слово (напр. «а а а а», «ну ну ну»).
    if len(set(words)) == 1 and len(words) > 1:
        return True
    return False


def transcribe_and_send(audio: np.ndarray):
    global last_transcribe_time, last_send_time
    now = time.time()
    if now - last_transcribe_time < 0.5:
        return
    last_transcribe_time = now

    # На случай гонки: если TTS уже заговорил пока мы транскрибируем
    if _is_tts_speaking():
        log.info("[MUTE] TTS говорит — транскрибация отменена")
        _write_status("listening")
        return

    if now - last_send_time < SEND_COOLDOWN_SEC:
        remaining = SEND_COOLDOWN_SEC - (now - last_send_time)
        log.info(f"[COOLDOWN] {remaining:.1f}s")
        print(f"[COOLDOWN] {remaining:.1f}s", flush=True)
        return

    if len(audio) < SAMPLE_RATE * 0.3:
        return

    try:
        _write_status("recognizing")
        with _whisper_lock:
            segments, info = whisper.transcribe(
                audio,
                language=CFG["language"],
                beam_size=CFG["beam_size"],
            )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        if text and is_hallucination(text):
            log.info(f"[SKIP hallucination] {text[:80]}")
            print(f"[SKIP] {text[:80]}", flush=True)
            return
        if text:
            preview = text[:120] + ("..." if len(text) > 120 else "")
            log.info(f"[ASR] {preview}")
            print(f"[ASR] {preview}", flush=True)
            last_send_time = time.time()
            _write_status("typing", text)
            send_text(text)
            if DEBUG:
                _dbg(f"[ASR] {preview}")
    except Exception as e:
        log.error(f"Whisper: {e}")
        print(f"Whisper error: {e}", flush=True)
    finally:
        # вернуться в активное состояние прослушивания, если не на паузе
        _write_status("listening" if is_active else "paused")

_vad_count = 0
def vad_loop():
    global last_transcribe_time, _vad_count
    pre_buffer: deque = deque(maxlen=PRE_SPEECH_CHUNKS)
    speech_buffer: list = []
    is_speaking = False
    silence_counter = 0
    _dbg_count = 0

    if DEBUG:
        _dbg("=== VAD DEBUG ===")
        _dbg(f"VAD_THRESHOLD     = {VAD_THRESHOLD}")
        _dbg(f"MIN_CHUNK_ENERGY  = {MIN_CHUNK_ENERGY}")
        _dbg(f"SILENCE_CHUNKS    = {SILENCE_CHUNKS} ({SILENCE_DURATION_SEC}s)")
        _dbg(f"MIN_SPEECH_CHUNKS = {MIN_SPEECH_CHUNKS} ({MIN_SPEECH_DURATION_SEC}s)")
        _dbg(f"FRAME_DURATION    = {FRAME_DURATION}s")
        _dbg(f"SAMPLE_RATE       = {SAMPLE_RATE} Hz")
        _dbg("-" * 50)

    while True:
        chunk = audio_queue.get()
        audio_queue.task_done()

        _vad_count += 1
        if _vad_count % 300 == 0:
            log.info(f"[VAD] alive: {_vad_count} chunks processed, cb={_cb_count}")
        if _vad_count % 100 == 0:
            _refresh_status()  # heartbeat для оверлея (~раз в 3с)

        energy = np.sqrt(np.mean(chunk ** 2))

        _dbg_count += 1
        if DEBUG and _dbg_count % 10 == 0:
            bar_len = 16
            ratio = energy / VAD_THRESHOLD if VAD_THRESHOLD > 0 else 0
            level = max(0, min(int(ratio * bar_len), bar_len))
            bar = "█" * level + "░" * (bar_len - level)
            tag = "ГОВОРИ" if is_speaking else "МОЛЧИ "
            extra = f"sil={silence_counter}/{SILENCE_CHUNKS}"
            if is_speaking:
                extra += f" spk={len(speech_buffer)}/{MIN_SPEECH_CHUNKS}"
            _dbg(f"[{tag}] rms={energy:.5f} thr={VAD_THRESHOLD:.5f} {bar}  {extra}")

        if not is_speaking:
            pre_buffer.append(chunk)
            if energy > VAD_THRESHOLD:
                speech_buffer = list(pre_buffer)
                speech_buffer.append(chunk)
                is_speaking = True
                silence_counter = 0
                if is_active and not _is_tts_speaking():
                    print(".", end="", flush=True)
                    _write_status("speaking")  # ты говоришь -> «Слушаю»
        else:
            speech_buffer.append(chunk)
            if energy > MIN_CHUNK_ENERGY:
                silence_counter = 0
            else:
                silence_counter += 1
                if silence_counter >= SILENCE_CHUNKS and len(speech_buffer) >= MIN_SPEECH_CHUNKS:
                    audio = np.concatenate(speech_buffer, axis=0).flatten()
                    is_speaking = False
                    speech_buffer = []
                    silence_counter = 0
                    if is_active and not _is_tts_speaking():
                        threading.Thread(target=transcribe_and_send, args=(audio,), daemon=True).start()

def on_press(key):
    global is_active
    pressed_keys.add(key)

    if has_hotkey("q"):
        log.info("QUIT")
        print("\n[QUIT]", flush=True)
        os._exit(0)
    if has_hotkey("v"):
        is_active = not is_active
        status = "LISTENING" if is_active else "PAUSED"
        log.info(f"[{status}]")
        print(f"\n[{status}]", flush=True)
        _write_status("listening" if is_active else "paused")

def on_release(key):
    try:
        pressed_keys.discard(key)
    except KeyError:
        pass

def main():
    global is_active
    print("=" * 44)
    print("  Voice Listener for OpenCode")
    print("=" * 44)
    print(f"  Whisper:   {WHISPER_MODEL_SIZE} ({WHISPER_DEVICE})")
    print(f"  Language:  {CFG['language']}")
    print(f"  VAD:       energy (threshold={VAD_THRESHOLD})")
    print()
    print("  [LISTENING] (default)")
    print("  Speak - pause - text in active window")
    print()
    print("  Hotkeys:")
    print("    Ctrl+Shift+V  pause/resume")
    print("    Ctrl+Shift+Q  quit")
    print("=" * 44)
    print()

    stream.start()
    log.info("Audio stream started")
    print("Audio stream started", flush=True)
    _write_status("listening")

    kb_listener = kb_ctrl.Listener(on_press=on_press, on_release=on_release)
    kb_listener.start()

    try:
        vad_loop()
    except KeyboardInterrupt:
        print("\nBye")
    except Exception as e:
        log.critical(f"VAD loop crashed: {e}", exc_info=True)
        print(f"VAD loop crash: {e}", flush=True)
    finally:
        stream.stop()
        stream.close()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log.critical(f"FATAL: {e}", exc_info=True)
        print(f"FATAL: {e}", flush=True)
        import traceback
        traceback.print_exc()
    except BaseException as e:
        log.critical(f"FATAL BASE: {e}")
        print(f"FATAL BASE: {e}", flush=True)
