# Try to use keyboard shortcut to search in YM desktop app
$targets = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'music-application*' } | Select-Object -First 1
$wsUrl = $page.webSocketDebuggerUrl

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = New-Object System.Threading.CancellationToken
$ws.ConnectAsync($wsUrl, $ct).Wait()

function Send($json) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 1, $true, $ct).Wait()
}

$id = 1

# Try Ctrl+E (common shortcut for search in many apps)
# Also try just typing 's' to focus search
# Or just click on search area

# Let's try: press Ctrl+E
$json = (@{id=$id; method="Input.dispatchKeyEvent"; params=@{type="rawKeyDown"; modifiers=2; windowsVirtualKeyCode=69; key="e"; code="KeyE"}} | ConvertTo-Json -Compress)
Send $json
$id++

$json = (@{id=$id; method="Input.dispatchKeyEvent"; params=@{type="char"; modifiers=2; text="e"; unmodifiedText="e"}} | ConvertTo-Json -Compress)
Send $json
$id++

$json = (@{id=$id; method="Input.dispatchKeyEvent"; params=@{type="keyUp"; modifiers=2; windowsVirtualKeyCode=69; key="e"; code="KeyE"}} | ConvertTo-Json -Compress)
Send $json
$id++

Start-Sleep -Seconds 1

# Now type the search query - first character
$query = "Скриптонит Куда он валится"
foreach ($ch in $query.ToCharArray()) {
    $code = [int]$ch
    $key = "$ch"
    $json = (@{id=$id; method="Input.dispatchKeyEvent"; params=@{type="rawKeyDown"; windowsVirtualKeyCode=$code; key=$key; code="Key$([char]::ToUpper($ch))"; text=$ch; unmodifiedText=$ch}} | ConvertTo-Json -Compress)
    Send $json
    $id++
    
    $json = (@{id=$id; method="Input.dispatchKeyEvent"; params=@{type="char"; text=$ch; unmodifiedText=$ch}} | ConvertTo-Json -Compress)
    Send $json
    $id++
    
    $json = (@{id=$id; method="Input.dispatchKeyEvent"; params=@{type="keyUp"; windowsVirtualKeyCode=$code; key=$key; code="Key$([char]::ToUpper($ch))"}} | ConvertTo-Json -Compress)
    Send $json
    $id++
    
    Start-Sleep -Milliseconds 30
}

Start-Sleep -Milliseconds 300

# Press Enter
$json = (@{id=$id; method="Input.dispatchKeyEvent"; params=@{type="rawKeyDown"; windowsVirtualKeyCode=13; key="Enter"; code="Enter"}} | ConvertTo-Json -Compress)
Send $json
$id++

$json = (@{id=$id; method="Input.dispatchKeyEvent"; params=@{type="char"; windowsVirtualKeyCode=13; key="Enter"; code="Enter"; text="`r"; unmodifiedText="`r"}} | ConvertTo-Json -Compress)
Send $json
$id++

$json = (@{id=$id; method="Input.dispatchKeyEvent"; params=@{type="keyUp"; windowsVirtualKeyCode=13; key="Enter"; code="Enter"}} | ConvertTo-Json -Compress)
Send $json
$id++

Start-Sleep -Milliseconds 500
try { $ws.CloseAsync($ct).Wait() } catch {}
Write-Output "Sent keyboard input"
