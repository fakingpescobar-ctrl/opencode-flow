param([string]$Action = 'status')

Add-Type -AssemblyName System.Web

$targets = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'music-application*' } | Select-Object -First 1
if (-not $page) { $page = $targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 }
$wsUrl = $page.webSocketDebuggerUrl

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = New-Object System.Threading.CancellationToken
$ws.ConnectAsync($wsUrl, $ct).Wait()

$msgId = 1

function SendCmd($method, $params) {
    $cmd = @{id=$msgId; method=$method}
    if ($params) { $cmd.params = $params }
    $json = $cmd | ConvertTo-Json -Compress -Depth 10
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 1, $true, $ct).Wait()
    $msgId++
}

function ReadResp() {
    $buf = New-Object byte[] 65536
    $result = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct)
    if ($result.Wait(3000)) {
        $len = $result.Result.Count
        return [System.Text.Encoding]::UTF8.GetString($buf, 0, $len)
    }
    return ""
}

if ($Action -eq 'status') {
    # Get current page info
    SendCmd "Runtime.evaluate" @{expression="navigator.userAgent"; returnByValue=$true}
    $r1 = ReadResp()
    Write-Output "Resp1: $r1"
} 
elseif ($Action -eq 'nowplaying') {
    # Try to find current track info through the DOM
    SendCmd "Runtime.evaluate" @{expression="document.title + ' | readyState=' + document.readyState"; returnByValue=$true}
    $r1 = ReadResp()
    Write-Output "INFO: $r1"
    
    # Get all visible text
    SendCmd "Runtime.evaluate" @{expression="document.body ? document.body.innerText.substring(0, 1000) : 'no body'"; returnByValue=$true}
    $r2 = ReadResp()
    Write-Output "TEXT: $r2"
}
elseif ($Action -eq 'search') {
    # Navigate to search page
    $url = "https://music.yandex.ru/search?text=" + [System.Web.HttpUtility]::UrlEncode("Скриптонит Куда он валится")
    SendCmd "Page.navigate" @{url=$url}
    $r1 = ReadResp()
    Write-Output "NAV: $r1"
    Start-Sleep -Seconds 5
    
    # Need to reconnect after navigation
    try { $ws.CloseAsync($ct).Wait() } catch {}
    $ws.Dispose()
    
    # Reconnect
    Start-Sleep -Milliseconds 500
    $targets2 = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
    $page2 = $targets2 | Where-Object { $_.type -eq 'page' -and $_.url -like '*music*' } | Select-Object -First 1
    if (-not $page2) { $page2 = $targets2 | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 }
    
    if ($page2.url -like '*music.yandex*') {
        Write-Output "On music.yandex.ru now!"
        $wsUrl2 = $page2.webSocketDebuggerUrl
        $ws2 = New-Object System.Net.WebSockets.ClientWebSocket
        $ws2.ConnectAsync($wsUrl2, $ct).Wait()
        $ws = $ws2
        
        # Try to click play on first result
        $js = "document.querySelector('[data-test-id=play-button]')?.click(); 'clicked'"
        SendCmd "Runtime.evaluate" @{expression=$js; returnByValue=$true}
        $r3 = ReadResp()
        Write-Output "PLAY: $r3"
        try { $ws.CloseAsync($ct).Wait() } catch {}
    } else {
        Write-Output "Still on: $($page2.url)"
    }
}

try { $ws.CloseAsync($ct).Wait() } catch {}
Write-Output "---"
