import ctypes, ctypes.wintypes

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
psapi = ctypes.windll.psapi

# First enumerate all visible windows with PID and name
seen = set()
@ctypes.WINFUNCTYPE(ctypes.wintypes.BOOL, ctypes.wintypes.HWND, ctypes.c_int)
def cb(hwnd, lparam):
    if not user32.IsWindowVisible(hwnd):
        return True
    pid = ctypes.wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if pid.value in seen:
        return True
    seen.add(pid.value)
    h = kernel32.OpenProcess(0x0410, False, pid.value)
    if h:
        buf = ctypes.create_unicode_buffer(260)
        if psapi.GetModuleBaseNameW(h, None, buf, 260):
            name = buf.value.lower()
            title_buf = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(hwnd, title_buf, 512)
            print(f'PID={pid.value:6d} name={name:20s} hwnd={hwnd:X} title="{title_buf.value}"')
        kernel32.CloseHandle(h)
    return True

user32.EnumWindows(cb, 0)
