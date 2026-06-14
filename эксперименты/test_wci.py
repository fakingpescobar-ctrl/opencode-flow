"""Test WriteConsoleInputW with CreateFile(CONIN$) against opencode.exe console."""
import ctypes, subprocess, json as _json, time
from ctypes import wintypes

def find_opencode_pids():
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-CimInstance Win32_Process -Filter \"Name = 'opencode.exe'\" "
             "| Select-Object ProcessId | ConvertTo-Json"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0 and r.stdout.strip():
            data = _json.loads(r.stdout)
            if isinstance(data, dict):
                data = [data]
            return [e["ProcessId"] for e in data]
    except Exception:
        pass
    return []

def send_to_opencode(text):
    kernel32 = ctypes.windll.kernel32
    pids = find_opencode_pids()
    print(f"Opencode PIDs: {pids}")
    if not pids:
        print("No opencode PIDs found!")
        return False
    
    pid = pids[0]
    kernel32.FreeConsole()
    if not kernel32.AttachConsole(pid):
        print(f"Failed to attach to console of PID {pid}")
        kernel32.AttachConsole(-1)
        return False
    
    # Use CreateFileW(CONIN$) to get the real console input handle
    conin = "CONIN$"
    hStdin = kernel32.CreateFileW(
        conin,
        0x80000000 | 0x40000000,  # GENERIC_READ | GENERIC_WRITE
        0x00000001 | 0x00000002,  # FILE_SHARE_READ | FILE_SHARE_WRITE
        None,
        3,  # OPEN_EXISTING
        0,
        None,
    )
    hStdin_val = ctypes.c_long(hStdin).value if hStdin else 0
    print(f"CreateFile CONIN$ handle: {hStdin_val}")
    
    if not hStdin or hStdin in (-1, 0):
        print("Invalid CONIN$ handle!")
        kernel32.FreeConsole()
        return False
    
    # Build input records
    KEY_EVENT = 0x0001
    VK_RETURN = 0x0D
    
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
    
    records = []
    for ch in text:
        records.append(INPUT_RECORD(KEY_EVENT, KEY_EVENT_RECORD(True, 1, 0, 0, ch, 0)))
        records.append(INPUT_RECORD(KEY_EVENT, KEY_EVENT_RECORD(False, 1, 0, 0, ch, 0)))
    # Add Enter
    records.append(INPUT_RECORD(KEY_EVENT, KEY_EVENT_RECORD(True, 1, VK_RETURN, 0, '\r', 0)))
    records.append(INPUT_RECORD(KEY_EVENT, KEY_EVENT_RECORD(False, 1, VK_RETURN, 0, '\r', 0)))
    
    buf = (INPUT_RECORD * len(records))(*records)
    written = wintypes.DWORD(0)
    result = kernel32.WriteConsoleInputW(hStdin, buf, len(records), ctypes.byref(written))
    last_err = ctypes.windll.kernel32.GetLastError()
    print(f"WriteConsoleInputW result={result}, written={written.value}, last_error={last_err}")
    
    kernel32.CloseHandle(hStdin)
    kernel32.FreeConsole()
    kernel32.AttachConsole(-1)
    return result != 0

# Test - send a test message
text = "/help"
print(f"Sending: '{text}'")
success = send_to_opencode(text)
print(f"Success: {success}")
