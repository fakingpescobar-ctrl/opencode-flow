param(
    [Parameter(Position=0, ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

$Action = if ($Arguments) { $Arguments[0] } else { 'playpause' }
$extra = if ($Arguments.Length -gt 1) { $Arguments[1..$($Arguments.Length-1)] -join ' ' } else { '' }

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

$script = "C:\Projects\opencode-tts\ym-control\ym-control.mjs"
if ($extra) {
    $result = node $script $Action $extra 2>&1
} else {
    $result = node $script $Action 2>&1
}
if ($LASTEXITCODE -eq 0) {
    Write-Output "$result"
}
else {
    Write-Output "YM: $Action FAIL - $result"
}
