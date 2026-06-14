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

# Navigate to search - exact track
$nav = @{id=$msgId; method="Page.navigate"; params=@{url="https://music.yandex.ru/search?text=%D0%A1%D0%BA%D1%80%D0%B8%D0%BF%D1%82%D0%BE%D0%BD%D0%B8%D1%82%20%D0%9A%D1%83%D0%B4%D0%B0%20%D0%BE%D0%BD%20%D0%B2%D0%B0%D0%BB%D0%B8%D1%82%D1%81%D1%8F"}} | ConvertTo-Json -Compress
& $sendMsg $ws $nav
$msgId++
Start-Sleep -Seconds 5

# Click play on the first result - find button that is a play button nearest to track with matching text
$js = @"
// Find track containing "Куда он валится" and click its play button
var tracks = document.querySelectorAll('.d-track, .track, [class*="track"]');
for (var i = 0; i < tracks.length; i++) {
    var t = tracks[i];
    if (t.innerText && t.innerText.indexOf('Куда он валится') !== -1) {
        var btn = t.querySelector('button');
        if (btn) { btn.click(); break; }
    }
}
// Fallback: just click first play button
if (!document.querySelector('.d-track_playing')) {
    var btn = document.querySelector('.d-track:first-child button, [data-test-id="play-button"]:first-child');
    if (btn) btn.click();
}
"@

$eval = @{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js}} | ConvertTo-Json -Compress -Depth 5
& $sendMsg $ws $eval
$msgId++

Start-Sleep -Seconds 1
try { $ws.CloseAsync($ct).Wait() } catch {}
Write-Output "Done"
