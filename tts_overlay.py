"""
Плавающий индикатор статуса TTS для opencode.

Прикреплён к окну Windows Terminal (как status_overlay.py).
Читает ~/.opencode-tts/tts-status.json (пишет tts_server.py):
    TTS загружается / TTS готов / Озвучиваю / TTS ошибка

Запуск: pythonw tts_overlay.py
"""

import os
import sys
import json
import time
import traceback
import tkinter as tk
import ctypes
import ctypes.wintypes as wt
from pathlib import Path

kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
kernel32.CreateMutexW(None, True, "Local\\OpenCodeTTS_TTSOverlay")
if ctypes.get_last_error() == 183:  # ERROR_ALREADY_EXISTS
    sys.exit(0)

_CRASH_LOG = Path.home() / ".opencode-tts" / "overlay_tts_crash.log"
def _log_crash(text: str):
    try:
        _CRASH_LOG.parent.mkdir(parents=True, exist_ok=True)
        _CRASH_LOG.write_text(text, encoding="utf-8")
    except Exception:
        pass
def _excepthook(t, v, tb):
    _log_crash("".join(traceback.format_exception(t, v, tb)))
sys.excepthook = _excepthook

STATUS_PATH = Path.home() / ".opencode-tts" / "tts-status.json"
STALE_SEC = 30
POLL_MS = 100
DOCK_TO_TERMINAL = True
WT_NAMES = {"windowsterminal.exe", "windowsterminalpreview.exe", "openconsole.exe"}

STATES = {
    "loading":  ("● TTS загружается…", "#7a5c00", "#ffffff"),
    "ready":    ("● TTS готов ✓",       "#1f7a33", "#ffffff"),
    "speaking": ("🔊 Озвучиваю…",       "#1f5fd0", "#ffffff"),
    "error":    ("● TTS ошибка",        "#5a1f1f", "#dddddd"),
    "offline":  ("● TTS offline",       "#3a3a3a", "#bbbbbb"),
}

W, H = 190, 30
MARGIN = 6
TASKBAR = 56
X_OFFSET = W + 8  # правее whisper-оверлея

user32 = ctypes.windll.user32
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

user32.GetForegroundWindow.restype = wt.HWND
user32.GetParent.restype = wt.HWND
kernel32.OpenProcess.restype = wt.HANDLE


def _move_overlay(x: int, y: int):
    root.geometry(f"{W}x{H}+{int(x)}+{int(y)}")
    root.update_idletasks()


def _pid_name(pid: int) -> str:
    h = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not h:
        return ""
    try:
        buf = ctypes.create_unicode_buffer(260)
        size = wt.DWORD(260)
        if kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
            return os.path.basename(buf.value).lower()
        return ""
    finally:
        kernel32.CloseHandle(h)


_cur_term = None


def foreground_terminal():
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return None
    pid = wt.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if _pid_name(pid.value) in WT_NAMES:
        return hwnd
    return None


root = tk.Tk()
root.overrideredirect(True)
root.attributes("-topmost", True)
root.attributes("-alpha", 0.92)
sw = root.winfo_screenwidth()
sh = root.winfo_screenheight()
root.geometry(f"{W}x{H}+{MARGIN + X_OFFSET}+{sh - H - TASKBAR}")

label = tk.Label(root, text="", font=("Segoe UI", 11, "bold"), anchor="w", padx=10)
label.pack(fill="both", expand=True)


def make_click_through():
    try:
        hwnd = user32.GetParent(root.winfo_id())
        GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT, WS_EX_NOACTIVATE = -20, 0x80000, 0x20, 0x08000000
        cur = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        user32.SetWindowLongW(hwnd, GWL_EXSTYLE, cur | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE)
    except Exception:
        pass


_last_valid = None

def read_state() -> str:
    global _last_valid
    try:
        d = json.loads(STATUS_PATH.read_text(encoding="utf-8"))
        if time.time() - float(d.get("ts", 0)) > STALE_SEC:
            return "offline"
        _last_valid = d.get("state", "offline")
        return _last_valid
    except Exception:
        return _last_valid if _last_valid else "offline"


def position_window() -> bool:
    global _cur_term
    if not DOCK_TO_TERMINAL:
        _cur_term = None
        _move_overlay(MARGIN + X_OFFSET, sh - H - TASKBAR)
        return True
    hwnd = foreground_terminal()
    if not hwnd or user32.IsIconic(hwnd):
        _cur_term = None
        return False
    rect = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    if (rect.right - rect.left) < 50 or (rect.bottom - rect.top) < 50:
        _cur_term = None
        return False
    _cur_term = hwnd
    _move_overlay(rect.left + MARGIN + X_OFFSET, rect.bottom - H - MARGIN)
    return True


_last_state = None
_visible = True
def apply_now():
    global _last_state, _visible
    show = position_window()
    if show and not _visible:
        root.deiconify(); _visible = True
    elif not show and _visible:
        root.withdraw(); _visible = False

    if show:
        st = read_state()
        if st != _last_state:
            _last_state = st
            text, bg, fg = STATES.get(st, STATES["offline"])
            label.config(text=text, bg=bg, fg=fg)
            root.config(bg=bg)
        root.attributes("-topmost", True)


def tick():
    apply_now()
    root.after(POLL_MS, tick)


root.after(150, make_click_through)
try:
    tick()
    root.mainloop()
except BaseException:
    _log_crash(traceback.format_exc())
