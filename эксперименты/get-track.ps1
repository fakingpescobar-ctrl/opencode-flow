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

function Get-Response($ws, $msgId) {
    $buf = New-Object byte[] 65536
    $result = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct).Result
    return [System.Text.Encoding]::UTF8.GetString($buf, 0, $result.Count)
}

# Get current track info via DOM
$eval = @{id=$msgId; method="Runtime.evaluate"; params=@{expression="(document.querySelector('.track__title') || document.querySelector('.d-track__name') || document.querySelector('.player-controls__track-name') || document.querySelector('.track__name'))?.innerText || 'not found'"; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5
& $sendMsg $ws $eval
$msgId++
Start-Sleep -Milliseconds 500
$resp = Get-Response $ws

# Try to get artist too
$eval2 = @{id=$msgId; method="Runtime.evaluate"; params=@{expression="(document.querySelector('.track__artists') || document.querySelector('.d-track__artists') || document.querySelector('.player-controls__artist-name'))?.innerText || ''"; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5
& $sendMsg $ws $eval2
$msgId++
Start-Sleep -Milliseconds 500
$resp2 = Get-Response $ws

try { $ws.CloseAsync($ct).Wait() } catch {}

Write-Output "RAW: $resp"
Write-Output "RAW2: $resp2"
