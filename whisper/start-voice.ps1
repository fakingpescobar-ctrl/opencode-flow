param([Switch]$Background)

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Убиваем все старые оверлеи и whisper_listener
$PythonProcesses = Get-CimInstance Win32_Process -Filter "Name LIKE 'python%'"
foreach ($p in $PythonProcesses) {
    $cl = $p.CommandLine
    if ($cl -match "whisper_listener|status_overlay|tts_overlay") {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Milliseconds 300
# Чистим lock-файлы на случай грязного завершения
Remove-Item "$env:USERPROFILE\.opencode-tts\overlay.lock" -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\.opencode-tts\tts_overlay.lock" -ErrorAction SilentlyContinue

$PythonExe = "C:\Users\OLD\anaconda3\envs\chatterbox-tts\pythonw.exe"
$Script = "$ProjectDir\whisper_listener.py"

if ($Background) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $PythonExe
    $psi.Arguments = "`"$Script`""
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    [void][System.Diagnostics.Process]::Start($psi)
} else {
    & $PythonExe "$Script"
}
