Add-Type -AssemblyName System.Web

$targets = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like '*music*' } | Select-Object -First 1
if (-not $page) { Write-Error "no page"; exit 1 }
$wsUrl = $page.webSocketDebuggerUrl

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = New-Object System.Threading.CancellationToken
$ws.ConnectAsync($wsUrl, $ct).Wait()

$msgId = 1
function Send($json) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 1, $true, $ct).Wait()
}
function ReadResp() {
    Start-Sleep -Milliseconds 500
    $buf = New-Object byte[] 65536
    $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct).Result
    return [System.Text.Encoding]::UTF8.GetString($buf, 0, $result.Count)
}

# First get current URL
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression="window.location.href"; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5)
$msgId++
Start-Sleep -Milliseconds 300
# Read all responses
$all = ""
for ($i = 0; $i -lt 5; $i++) {
    Start-Sleep -Milliseconds 100
    $buf = New-Object byte[] 65536
    try {
        $ar = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct)
        if ($ar.Wait(500)) {
            $len = $ar.Result.Count
            $all += [System.Text.Encoding]::UTF8.GetString($buf, 0, $len)
        }
    } catch { break }
}
Write-Output "PAGE INFO: $all"
try { $ws.CloseAsync($ct).Wait() } catch {}
