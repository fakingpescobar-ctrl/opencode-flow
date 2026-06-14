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

# Use YM API to search and store result info in document title
$js = @"
(async function(){
    try {
        var r = await fetch('https://api.music.yandex.net/search?text=' + encodeURIComponent('Скриптонит Куда он валится') + '&type=track');
        var data = await r.json();
        var tracks = data?.result?.tracks?.results || [];
        if (tracks.length > 0) {
            var t = tracks[0];
            document.title = 'FOUND: ' + (t.artists||[]).map(function(a){return a.name}).join(', ') + ' - ' + t.title + ' (id=' + t.id + ')';
            // Try to play it via internal player
            window.player && window.player.play && window.player.play(t.id);
            // Alternative: dispatch custom event
            window.dispatchEvent(new CustomEvent('ym-play', {detail: {id: t.id}}));
        } else {
            document.title = 'NOT FOUND: no tracks in search';
        }
    } catch(e) {
        document.title = 'ERR: ' + e.message;
    }
})();
"@
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js}} | ConvertTo-Json -Compress -Depth 5)
$msgId++
Start-Sleep -Seconds 4
try { $ws.CloseAsync($ct).Wait() } catch {}

Start-Sleep -Milliseconds 200
$targets2 = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page2 = $targets2 | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
Write-Output "RESULT: $($page2.title)"
