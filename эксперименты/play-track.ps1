param([string]$Query = "Скриптонит Куда он валится")

# Get YM page via CDP
$targets = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like '*music*' } | Select-Object -First 1
if (-not $page) {
    Write-Error "YM page not found"
    exit 1
}
$wsUrl = $page.webSocketDebuggerUrl

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = New-Object System.Threading.CancellationToken
$ws.ConnectAsync($wsUrl, $ct).Wait()

$msgId = 1
$sendMsg = {
    param($ws, $json)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 1, $true, $ct).Wait()
}

# Encode query for URL
$encoded = [System.Web.HttpUtility]::UrlEncode($Query)

# Navigate to search page
$nav = @{id=$msgId; method="Page.navigate"; params=@{url="https://music.yandex.ru/search?text=$encoded"}} | ConvertTo-Json -Compress
& $sendMsg $ws $nav
$msgId++
Start-Sleep -Seconds 4

# Try to click first track play button
$evalJs = @"
document.querySelector('div[data-test-id="play-button"]')?.click() ||
document.querySelector('.d-track__play-btn')?.click() ||
document.querySelector('button[class*="play"]')?.click() ||
document.querySelector('.track__play-button')?.click();
"@

$eval = @{id=$msgId; method="Runtime.evaluate"; params=@{expression=$evalJs}} | ConvertTo-Json -Compress -Depth 5
& $sendMsg $ws $eval
$msgId++

Start-Sleep -Milliseconds 500
try { $ws.CloseAsync($ct).Wait() } catch {}
Write-Output "Searched for '$Query' and clicked play"
