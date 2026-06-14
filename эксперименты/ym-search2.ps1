Add-Type -AssemblyName System.Web

$targets = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page = $targets | Where-Object { $_.type -eq 'page' -and ($_.url -like '*music*' -or $_.url -like '*yandex*') } | Select-Object -First 1
if (-not $page) { Write-Error "no music page"; exit 1 }
$wsUrl = $page.webSocketDebuggerUrl

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = New-Object System.Threading.CancellationToken
$ws.ConnectAsync($wsUrl, $ct).Wait()

$msgId = 1
function Send($json) { 
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 1, $true, $ct).Wait()
}

# Navigate using JS window.location so WebSocket stays alive
$url = "https://music.yandex.ru/search?text=" + [System.Web.HttpUtility]::UrlEncode("Скриптонит Куда он валится")
$js = "window.location.href = '$url'"
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js}} | ConvertTo-Json -Compress -Depth 5)
$msgId++
Write-Output "Navigating..."
Start-Sleep -Seconds 6

# Now try to find track and click its play button
$js2 = @"
(function(){
    // First try to find a track element containing the right text
    var items = document.querySelectorAll('.d-track, [class*=track], [class*=Track]');
    for (var i = 0; i < items.length; i++) {
        var txt = items[i].innerText || '';
        if (txt.indexOf('Куда он валится') > -1) {
            // Found it - click the play button inside
            var btn = items[i].querySelector('[data-test-id=play-button], button, [class*=play], [class*=Play]');
            if (btn) { btn.click(); return 'clicked correct track'; }
        }
    }
    // Fallback: click first play button in the results
    var btn = document.querySelector('[data-test-id=play-button]');
    if (btn) { btn.click(); return 'clicked first play'; }
    return 'no play button found';
})();
"@
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js2}} | ConvertTo-Json -Compress -Depth 5)
$msgId++
Start-Sleep -Seconds 2

try { $ws.CloseAsync($ct).Wait() } catch {}
Write-Output "Done"
