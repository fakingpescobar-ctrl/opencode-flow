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

# Dump some useful info about the current state
# Get current track info from various possible selectors
$js = @"
(function(){
    var info = [];
    // Try find playing indicator or current track
    var playing = document.querySelector('[class*=playing], [class*=Playing], [class*=current], [class*=Current]');
    if (playing) info.push('Playing el: ' + (playing.className || playing.tagName));
    // Try meta tags or title
    var title = document.querySelector('title');
    if (title) info.push('Title: ' + title.innerText);
    // Look for track info in headings
    var h = document.querySelectorAll('h1, h2, h3, h4');
    h.forEach(function(el){ info.push(el.tagName + ': ' + el.innerText.trim().substring(0,80)); });
    // Check data attributes
    var all = document.querySelectorAll('[class*=track], [class*=Track], [class*=song], [class*=Song]');
    info.push('Track elements: ' + all.length);
    if (all.length > 0) {
        info.push('First: ' + (all[0].className || all[0].tagName) + ' | ' + (all[0].innerText || '').trim().substring(0,50));
    }
    // Check header area for track info
    var header = document.querySelector('[class*=header], [class*=Header], [class*=player], [class*=Player]');
    if (header) info.push('Header/Player: ' + (header.className || header.tagName).substring(0,80));
    return info.join('\n');
})();
"@
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5)
$msgId++
Start-Sleep -Seconds 1
try { $ws.CloseAsync($ct).Wait() } catch {}
Write-Output "Check finished"
