param(
    [ValidateSet('next', 'prev', 'playpause', 'right', 'left')]
    [string]$Action = 'next'
)

# Get page target dynamically
$targets = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'music-application*' } | Select-Object -First 1
if (-not $page) {
    Write-Error "YM page not found"
    exit 1
}
$wsUrl = $page.webSocketDebuggerUrl

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = New-Object System.Threading.CancellationToken
$ws.ConnectAsync($wsUrl, $ct).Wait()

$sendMsg = { param($ws, $json) 
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 1, $true, $ct).Wait()
}

$msgId = 1

# Dispatch keyboard event based on action
switch ($Action) {
    'next'     { $key = 'MediaNextTrack'; $code = 'MediaTrackNext' }
    'prev'     { $key = 'MediaPreviousTrack'; $code = 'MediaTrackPrevious' }
    'playpause' { $key = 'MediaPlayPause'; $code = 'MediaPlayPause' }
    'right'    { $key = 'ArrowRight'; $code = 'ArrowRight' }
    'left'     { $key = 'ArrowLeft'; $code = 'ArrowLeft' }
}

# rawKeyDown
$json = @"
{"id":$msgId,"method":"Input.dispatchKeyEvent","params":{"type":"rawKeyDown","windowsVirtualKeyCode":0,"nativeVirtualKeyCode":0,"macCharCode":0,"key":"$key","code":"$code","text":"","unmodifiedText":"","keyIdentifier":"","autoRepeat":false,"isKeypad":false,"isSystemKey":false,"windowsKeyCode":0}}
"@
&$sendMsg $ws $json
$msgId++

# char event
$json = @"
{"id":$msgId,"method":"Input.dispatchKeyEvent","params":{"type":"char","windowsVirtualKeyCode":0,"nativeVirtualKeyCode":0,"macCharCode":0,"key":"$key","code":"$code","text":"","unmodifiedText":"","keyIdentifier":"","autoRepeat":false,"isKeypad":false,"isSystemKey":false,"windowsKeyCode":0}}
"@
&$sendMsg $ws $json
$msgId++

# keyUp
$json = @"
{"id":$msgId,"method":"Input.dispatchKeyEvent","params":{"type":"keyUp","windowsVirtualKeyCode":0,"nativeVirtualKeyCode":0,"macCharCode":0,"key":"$key","code":"$code","text":"","unmodifiedText":"","keyIdentifier":"","autoRepeat":false,"isKeypad":false,"isSystemKey":false,"windowsKeyCode":0}}
"@
&$sendMsg $ws $json

Start-Sleep -Milliseconds 100
$ws.CloseAsync($ct).Wait()

Write-Output "Sent $Action via CDP"
