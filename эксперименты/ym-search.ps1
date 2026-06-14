param([string]$Action = 'find')

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

if ($Action -eq 'find') {
    # Navigate to search
    $url = "https://music.yandex.ru/search?text=" + [System.Web.HttpUtility]::UrlEncode("Скриптонит Куда он валится")
    Send (@{id=$msgId; method="Page.navigate"; params=@{url=$url}} | ConvertTo-Json -Compress)
    $msgId++
    Write-Output "Navigated to search..."
    Start-Sleep -Seconds 5

    # Get current URL to confirm
    Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression="'URL: ' + window.location.href + ' | Title: ' + document.title"; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5)
    $msgId++
    Start-Sleep -Seconds 1

    # Try to play the first track in search results
    # First try clicking the result link that contains the track name, then play
    $js = @"
(function(){
    var links = document.querySelectorAll('a');
    var found = null;
    for (var i = 0; i < links.length; i++) {
        if (links[i].innerText.indexOf('Куда он валится') > -1) {
            found = links[i];
            break;
        }
    }
    if (found) {
        // Go to track page
        window.location.href = found.href;
        return 'Found track link: ' + found.href;
    }
    // Fallback: click first play button
    var btn = document.querySelector('[data-test-id=\"play-button\"]');
    if (btn) { btn.click(); return 'Clicked play'; }
    return 'Nothing found';
})();
"@
    Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js}} | ConvertTo-Json -Compress -Depth 5)
    $msgId++
    Start-Sleep -Seconds 3

    # If we navigated to track page, now click play
    $js2 = "document.querySelector('.player-controls__play, .play pause, [class*=play]')?.click(); 'played'"
    Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js2}} | ConvertTo-Json -Compress -Depth 5)
    $msgId++
    Start-Sleep -Seconds 1
}

try { $ws.CloseAsync($ct).Wait() } catch {}
Write-Output "Done"
