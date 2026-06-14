Add-Type -AssemblyName System.Web
$targets = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like '*music*' } | Select-Object -First 1
$wsUrl = $page.webSocketDebuggerUrl

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = New-Object System.Threading.CancellationToken
$ws.ConnectAsync($wsUrl, $ct).Wait()

$msgId = 1
function Send($json) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 1, $true, $ct).Wait()
}

# Get track info
$js = "var t = document.querySelector('.track__title, .d-track__name, .player-controls__track, .track__name'); var a = document.querySelector('.track__artists, .d-track__artists, .player-controls__artist'); (t?t.innerText:'?') + ' - ' + (a?a.innerText:'?')"
$eval = @{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5
Send $eval
$msgId++

# Read response
Start-Sleep -Milliseconds 800
$buf = New-Object byte[] 131072
$result = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct).Result
$text = [System.Text.Encoding]::UTF8.GetString($buf, 0, $result.Count)
try { $ws.CloseAsync($ct).Wait() } catch {}
Write-Output $text
