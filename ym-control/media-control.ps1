param(
    [Parameter(Position=0)]
    [string]$Action = 'next'
)

$exe = "C:\Projects\opencode-tts\ym-control\ym_control.exe"
if (-not (Test-Path $exe)) {
    Write-Error "ym_control.exe not found at $exe"
    exit 1
}

# Check YM debug port is open
try {
    $r = Invoke-WebRequest -Uri "http://localhost:9222/json/version" -UseBasicParsing -TimeoutSec 5
    if (-not $r.Content) { throw "empty" }
}
catch {
    Write-Error "YM remote debugging port (9222) not available. Start YM with --remote-debugging-port=9222"
    exit 1
}

if ($Action -match '^volume_\d+$') { } elseif ($Action -match '^\d+$') {
    $Action = "volume_$Action"
}
$result = & $exe $Action 2>&1
$last = ($result | Select-Object -Last 1).Trim()
if ($last -match 'OK|Sent|left|right|prev|restart|volume|next|playpause') {
    Write-Output "YM: $Action OK"
}
else {
    Write-Output "YM: $Action FAIL - $last"
}
