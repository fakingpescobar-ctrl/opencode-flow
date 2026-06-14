import ctypes, ctypes.wintypes, subprocess, json

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
psapi = ctypes.windll.psapi

# 1. Find all processes named opencode.exe
result = subprocess.run(
    ["powershell", "-NoProfile", "-Command",
     "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'opencode.exe' } | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json"],
    capture_output=True, text=True, timeout=10
)
print("=== opencode.exe processes ===")
print(result.stdout)

# 2. Enumerate all visible windows and their matching PIDs
data = json.loads(result.stdout) if result.stdout.strip() else []
if isinstance(data, dict):
    data = [data]
if not data:
    print("No opencode.exe process found!")

for proc in data:
    pid = proc['ProcessId']
    parent_pid = proc['ParentProcessId']
    print(f"\nopencode.exe PID={pid}, ParentPID={parent_pid}")
    print(f"CommandLine: {proc.get('CommandLine', 'N/A')}")
    
    # Find visible window with this PID or parent PID
    seen = set()
    @ctypes.WINFUNCTYPE(ctypes.wintypes.BOOL, ctypes.wintypes.HWND, ctypes.c_int)
    def cb(hwnd, lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        pid2 = ctypes.wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid2))
        if pid2.value in seen:
            return True
        seen.add(pid2.value)
        if pid2.value == pid or pid2.value == parent_pid:
            title_buf = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(hwnd, title_buf, 512)
            h = kernel32.OpenProcess(0x0410, False, pid2.value)
            name = "?"
            if h:
                buf = ctypes.create_unicode_buffer(260)
                if psapi.GetModuleBaseNameW(h, None, buf, 260):
                    name = buf.value
                kernel32.CloseHandle(h)
            print(f'  WIN: HWND={hwnd:X} PID={pid2.value} name={name} title="{title_buf.value}"')
        return True
    
    user32.EnumWindows(cb, 0)
