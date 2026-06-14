param(
    [Parameter(Mandatory, Position = 0)]
    [string]$Message,
    [switch]$Silent
)

$configPath = "$env:USERPROFILE\.opencode-tts\telegram-config.json"
if (-not (Test-Path $configPath)) {
    Write-Error "Telegram config not found at $configPath"
    exit 1
}

$cfg = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

$body = @{
    chat_id = $cfg.channel
    text = $Message
    parse_mode = "Markdown"
    disable_notification = $Silent.IsPresent
} | ConvertTo-Json

try {
    $url = "https://api.telegram.org/bot$($cfg.token)/sendMessage"
    $r = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
    Write-Output "OK: message sent to $($cfg.channel)"
}
catch {
    Write-Error "Failed: $_"
    exit 1
}
