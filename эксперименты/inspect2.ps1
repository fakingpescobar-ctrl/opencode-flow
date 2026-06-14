$targets = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page = $targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
$wsUrl = $page.webSocketDebuggerUrl

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = New-Object System.Threading.CancellationToken
$ws.ConnectAsync($wsUrl, $ct).Wait()

$msgId = 1
function Send($json) { 
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 1, $true, $ct).Wait()
}

# Set document title to track info so we can read it from page list
$js = @"
(function(){
    var info = 'Track: ';
    var trackEl = document.querySelector('[class*=player] [class*=title], [class*=Player] [class*=Title], .player__track, [class*=nowplaying], [class*=NowPlaying]');
    if (trackEl) info += trackEl.innerText.trim();
    else {
        // Try to find any element with text that looks like a song
        var nodes = document.querySelectorAll('body *:not(script):not(style)');
        for (var i = 0; i < nodes.length; i++) {
            var t = nodes[i].innerText;
            if (t && t.length > 5 && t.length < 100 && !t.includes('\n') && nodes[i].children.length === 0) {
                info += t.trim();
                break;
            }
        }
    }
    info += ' | URL: ' + window.location.href;
    document.title = info;
    return info;
})();
"@
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5)
$msgId++
Start-Sleep -Milliseconds 500
try { $ws.CloseAsync($ct).Wait() } catch {}

# Now re-read page list
Start-Sleep -Milliseconds 200
$targets2 = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page2 = $targets2 | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
Write-Output "TRACK: $($page2.title)"
