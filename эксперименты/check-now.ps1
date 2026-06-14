Add-Type -AssemblyName System.Web

$targets = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page = $targets | Where-Object { $_.type -eq 'page' -and ($_.url -like '*music*' -or $_.url -like '*yandex*') } | Select-Object -First 1
$wsUrl = $page.webSocketDebuggerUrl

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = New-Object System.Threading.CancellationToken
$ws.ConnectAsync($wsUrl, $ct).Wait()

$msgId = 1
function Send($json) { 
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 1, $true, $ct).Wait()
}

# Get current URL and title
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression="'Page: ' + window.location.href"; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5)
$msgId++

# Get playing track info
$js = @"
(function(){
    var title = document.querySelector('.player-controls__track-name, .track__title, .d-track__name, .track__name');
    var artist = document.querySelector('.player-controls__artist-name, .track__artists, .d-track__artists');
    var t = title ? title.innerText.trim() : '?';
    var a = artist ? artist.innerText.trim() : '?';
    return a + ' — ' + t;
})();
"@
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5)
$msgId++

Start-Sleep -Seconds 1
try { $ws.CloseAsync($ct).Wait() } catch {}

# Output what we know
Write-Output "---"
Write-Output "URL: $($page.url)"
Write-Output "Check YM screen for current track"
