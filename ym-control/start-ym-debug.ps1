# Start Yandex Music with remote debugging port for CDP control
$ymDir = "C:\Users\OLD\AppData\Local\Programs\YandexMusic"
$exe = Get-ChildItem $ymDir -Filter "*.exe" | Where-Object { $_.Name -notmatch 'Uninstall' } | Select-Object -First 1

if (-not $exe) {
    Write-Error "Yandex Music executable not found"
    exit 1
}

# Check if already running
$running = Get-Process | Where-Object { $_.Path -eq $exe.FullName -and $_.MainWindowHandle -ne 0 }
if ($running) {
    Write-Output "YM already running (PID: $($running.Id))"
    
    # Check if debug port is open
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:9222/json/version" -UseBasicParsing -TimeoutSec 2
        Write-Output "Debug port 9222 OK"
        exit 0
    } catch {
        Write-Output "Port 9222 not available, restarting..."
        $running | Stop-Process -Force
        Start-Sleep -Seconds 2
    }
}

try {
    Start-Process -FilePath $exe.FullName -ArgumentList '--remote-debugging-port=9222'
    Write-Output "Started YM with --remote-debugging-port=9222"
} catch {
    Write-Error "Failed to start: $_"
}
