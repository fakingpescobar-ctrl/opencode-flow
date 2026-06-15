"""
Плавающий индикатор статуса Whisper для opencode.

Прикреплён к окну Windows Terminal (где рендерится opencode): встаёт у нижнего
левого края окна WT, ездит за ним, показывается когда WT — активное окно.
opencode рендерится в WT через ConPTY и своего трекаемого окна не имеет, поэтому
цепляемся к окну терминала. Если WT не в фокусе — оверлей прячется.
Если DOCK_TO_TERMINAL=False — фиксированный левый нижний угол экрана (всегда виден).

Читает ~/.opencode-tts/voice-status.json (пишет whisper_listener.py):
    Whisper is Alive / Слушаю / печатаю / Whisper offline

Запуск: pythonw status_overlay.py
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
kernel32.CreateMutexW(None, True, "Local\\OpenCodeTTS_StatusOverlay")
if ctypes.get_last_error() == 183:  # ERROR_ALREADY_EXISTS
    sys.exit(0)

_PARENT_PID = None
for i, a in enumerate(sys.argv):
    if a == '--parent-pid' and i + 1 < len(sys.argv):
        try: _PARENT_PID = int(sys.argv[i + 1])
        except: pass
        break

_CRASH_LOG = Path.home() / ".opencode-tts" / "overlay_crash.log"
def _log_crash(text: str):
    try:
        _CRASH_LOG.parent.mkdir(parents=True, exist_ok=True)
        _CRASH_LOG.write_text(text, encoding="utf-8")
    except Exception:
        pass
def _excepthook(t, v, tb):
    _log_crash("".join(traceback.format_exception(t, v, tb)))
sys.excepthook = _excepthook

STATUS_PATH = Path.home() / ".opencode-tts" / "voice-status.json"
STALE_SEC = 12
POLL_MS = 80
DOCK_TO_TERMINAL = True
WT_NAMES = {"windowsterminal.exe", "windowsterminalpreview.exe", "openconsole.exe"}

STATES = {
    "loading":     ("● Whisper загружается…", "#7a5c00", "#ffffff"),
    "listening":   ("● Whisper is Alive",     "#1f7a33", "#ffffff"),
    "speaking":    ("● Слушаю",               "#1f5fd0", "#ffffff"),
    "recognizing": ("● печатаю",              "#b58900", "#000000"),
    "typing":      ("● печатаю",              "#b58900", "#000000"),
    "paused":      ("⏸ Пауза",               "#3a3a3a", "#bbbbbb"),
    "offline":     ("● Whisper offline",      "#5a1f1f", "#dddddd"),
}

W, H = 190, 30
MARGIN = 6
TASKBAR = 56

user32 = ctypes.windll.user32
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
SYNCHRONIZE = 0x00100000
WAIT_OBJECT_0 = 0x00000000
WAIT_TIMEOUT = 0x00000102

user32.GetForegroundWindow.restype = wt.HWND
user32.GetParent.restype = wt.HWND
user32.IsWindow.restype = wt.BOOL
user32.IsWindow.argtypes = [wt.HWND]
kernel32.OpenProcess.restype = wt.HANDLE
kernel32.WaitForSingleObject.restype = wt.DWORD
kernel32.WaitForSingleObject.argtypes = [wt.HANDLE, wt.DWORD]

def _move_overlay(x: int, y: int):
    """Двигает оверлей. update_idletasks ОБЯЗАТЕЛЕН — без него tkinter откладывает
    применение геометрии до перерисовки, и окно не едет за терминалом вживую."""
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


_cur_term = None  # HWND терминала, к которому сейчас прицеплены

def foreground_terminal():
    """HWND активного окна, если это Windows Terminal, иначе None."""
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return None
    pid = wt.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if _pid_name(pid.value) in WT_NAMES:
        return hwnd
    return None


def _reposition_current(hwnd):
    """Быстрый путь: подвинуть оверлей к низу hwnd (без проверок процесса)."""
    rect = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    if (rect.right - rect.left) >= 50 and (rect.bottom - rect.top) >= 50:
        _move_overlay(rect.left + MARGIN, rect.bottom - H - MARGIN)


# ── Окно индикатора ──
root = tk.Tk()
root.overrideredirect(True)
root.attributes("-topmost", True)
root.attributes("-alpha", 0.92)
sw = root.winfo_screenwidth()
sh = root.winfo_screenheight()
root.geometry(f"{W}x{H}+{MARGIN}+{sh - H - TASKBAR}")

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


def read_state() -> str:
    try:
        d = json.loads(STATUS_PATH.read_text(encoding="utf-8"))
        if time.time() - float(d.get("ts", 0)) > STALE_SEC:
            return "offline"
        return d.get("state", "offline")
    except Exception:
        return "offline"


def position_window():
    """Двигает оверлей к низу окна терминала. False -> спрятать."""
    global _cur_term
    if not DOCK_TO_TERMINAL:
        _cur_term = None
        _move_overlay(MARGIN, sh - H - TASKBAR)
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
    _move_overlay(rect.left + MARGIN, rect.bottom - H - MARGIN)
    return True


_last_state = None
_visible = True

_tick_count = 0
def is_parent_alive():
    if not _PARENT_PID:
        return True
    h = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, False, _PARENT_PID)
    if not h:
        return False
    try:
        return kernel32.WaitForSingleObject(h, 0) == WAIT_TIMEOUT
    finally:
        kernel32.CloseHandle(h)

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
    global _tick_count
    _tick_count += 1
    if _tick_count % 10 == 0:
        if _cur_term and not user32.IsWindow(_cur_term):
            sys.exit(0)
        if not is_parent_alive():
            sys.exit(0)
    apply_now()
    root.after(POLL_MS, tick)

root.after(150, make_click_through)
try:
    tick()
    root.mainloop()
except BaseException:
    _log_crash(traceback.format_exc())
