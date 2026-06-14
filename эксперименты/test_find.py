import ctypes, ctypes.wintypes, subprocess, json, sys, logging

wintypes = ctypes.wintypes

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("test")

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
psapi = ctypes.windll.psapi

# ---- step 1: parent-PID approach ----
try:
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "Get-CimInstance Win32_Process -Filter \"Name = 'opencode.exe'\" "
         "| Select-Object ProcessId,ParentProcessId | ConvertTo-Json"],
        capture_output=True, text=True, timeout=10,
    )
    print(f"PowerShell stdout: [{r.stdout}]")
    print(f"PowerShell stderr: [{r.stderr}]")
    if r.returncode == 0 and r.stdout.strip():
        data = json.loads(r.stdout)
        if isinstance(data, dict):
            data = [data]
        print(f"Parsed data: {data}")
        for entry in data:
            parent_pid = entry.get("ParentProcessId")
            print(f"opencode PID={entry['ProcessId']}, parent PID={parent_pid}")
            if not parent_pid:
                continue
            hwnd_found = [None]
            @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, ctypes.c_int)
            def _cb(hwnd, _lparam, _target=parent_pid):
                if not user32.IsWindowVisible(hwnd):
                    return True
                pid = wintypes.DWORD()
                user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                if pid.value == _target:
                    title_buf = ctypes.create_unicode_buffer(512)
                    user32.GetWindowTextW(hwnd, title_buf, 512)
                    print(f"  Found window: HWND={hwnd:X} PID={pid.value} title='{title_buf.value}'")
                    hwnd_found[0] = hwnd
                    return False
                return True
            user32.EnumWindows(_cb, 0)
            if hwnd_found[0]:
                print(f"SUCCESS: TUI HWND = {hwnd_found[0]}")
            else:
                print("FAIL: No window found for parent PID")
    else:
        print("FAIL: PowerShell returned nothing")
except Exception as exc:
    print(f"FAIL: {exc}")
