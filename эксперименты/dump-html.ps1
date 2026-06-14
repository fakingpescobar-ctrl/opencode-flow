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

# Get outer HTML structure - just tag names and classes
$js = @"
(function(){
    function dump(el, depth) {
        if (depth > 5 || !el || el.children === undefined) return '';
        var s = '';
        var tag = el.tagName ? el.tagName.toLowerCase() : '#text';
        if (tag === 'script' || tag === 'style') return '';
        var cls = el.className ? (' class=' + (typeof el.className === 'string' ? el.className.substring(0, 40) : 'obj')) : '';
        var id = el.id ? ' id=' + el.id : '';
        s += '  '.repeat(depth) + '<' + tag + id + cls + '>';
        if (tag === 'input' && el.placeholder) s += ' placeholder="' + el.placeholder + '"';
        if (tag === 'input' && el.type) s += ' type="' + el.type + '"';
        if (el.innerText && el.children.length === 0 && el.innerText.trim().length < 100) {
            s += ' text="' + el.innerText.trim().substring(0, 50) + '"';
        }
        s += '\n';
        for (var i = 0; i < (el.children.length > 10 ? 10 : el.children.length); i++) {
            s += dump(el.children[i], depth + 1);
        }
        if (el.children.length > 10) s += '  '.repeat(depth+1) + '... (' + el.children.length + ' total)\n';
        return s;
    }
    return dump(document.body, 0);
})();
"@
Send (@{id=$msgId; method="Runtime.evaluate"; params=@{expression=$js; returnByValue=$true}} | ConvertTo-Json -Compress -Depth 5)
$msgId++
Start-Sleep -Milliseconds 500
try { $ws.CloseAsync($ct).Wait() } catch {}

# The page title may have been overwritten by us, check it
Start-Sleep -Milliseconds 100
$targets2 = (Invoke-WebRequest -Uri "http://localhost:9222/json" -UseBasicParsing).Content | ConvertFrom-Json
$page2 = $targets2 | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
Write-Output "TITLE: $($page2.title)"
