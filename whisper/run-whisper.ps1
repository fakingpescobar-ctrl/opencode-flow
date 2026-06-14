# Auto-restart wrapper for whisper_listener.py
$Python = "C:\Users\OLD\anaconda3\envs\chatterbox-tts\pythonw.exe"
$Script = "C:\Projects\opencode-tts\whisper\whisper_listener.py"
$LogFile = "$env:USERPROFILE\.opencode-tts\runner.log"

while ($true) {
    $start = Get-Date
    "$(Get-Date -Format HH:mm:ss) Starting whisper..." | Add-Content $LogFile
    & $Python $Script 2>&1 | Out-Null
    $exitCode = $LASTEXITCODE
    $duration = [math]::Round(((Get-Date) - $start).TotalSeconds)
    "$(Get-Date -Format HH:mm:ss) Exited after ${duration}s (code=$exitCode), restarting in 2s..." | Add-Content $LogFile
    Start-Sleep -Seconds 2
}
