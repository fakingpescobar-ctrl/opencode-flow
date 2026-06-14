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

# Dump all input elements and their attributes to page title
$js = @"
(function(){
    var inputs = document.querySelectorAll('input[type=text], input[type=search], input:not([type]), [contenteditable], [role=searchbox]');
    var info = 'Found ' + inputs.length + ' inputs: ';
    for (var i = 0; i < inputs.length; i++) {
        info += '#' + i + ' tag=' + inputs[i].tagName + ' type=' + (inputs[i].type||'?') + ' placeholder="' + (inputs[i].placeholder||'') + '" ';
        info += 'class="' + (inputs[i].className||'').substring(0,40) + '" ';
        info += 'id="' + (inputs[i].id||'') + '" ';
        var rect = inputs[i].getBoundingClientRect();
        info += 'rect=' + Math.round(rect.x) + ',' + Math.round(rect.y) + '-' + Math.round(rect.width) + 'x' + Math.round(rect.height);
    }
    document.title = info;
    return info;
})();
"@
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5)
$msgId++
Start-Sleep -Milliseconds 500
try { $ws.CloseAsync($ct).Wait() } catch {}

Start-Sleep -Milliseconds 200
$targets2 = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page2 = $targets2 | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
Write-Output "INPUTS: $($page2.title)"
