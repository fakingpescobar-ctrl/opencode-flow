$targets = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page = $targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
Write-Output "CURRENT URL: $($page.url)"
Write-Output "CURRENT TITLE: $($page.title)"

$wsUrl = $page.webSocketDebuggerUrl
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = New-Object System.Threading.CancellationToken
$ws.ConnectAsync($wsUrl, $ct).Wait()

$msgId = 1
function Send($json) { 
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 1, $true, $ct).Wait()
}

# Simplest test - just set document title
$js = "document.title = 'HELLO_FROM_CDP_' + Date.now();"
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js}} | ConvertTo-Json -Compress -Depth 5)
$msgId++
Start-Sleep -Milliseconds 500

$js2 = "document.title"
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js2; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5)
$msgId++
Start-Sleep -Milliseconds 500

try { $ws.CloseAsync($ct).Wait() } catch {}

Start-Sleep -Milliseconds 200
$targets2 = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page2 = $targets2 | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
Write-Output "AFTER URL: $($page2.url)"
Write-Output "AFTER TITLE: $($page2.title)"
