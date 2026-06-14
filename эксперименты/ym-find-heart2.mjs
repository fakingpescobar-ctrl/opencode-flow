import http from 'node:http';
const data = await new Promise(r => http.get('http://localhost:9222/json', res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); }));
const page = data.find(t => t.type === 'page' && t.url.includes('music-application'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 1;
function send(m, p) {
    return new Promise(res => {
        let mid = id++; ws.send(JSON.stringify({id:mid, method:m, params:p}));
        let h = e => { try { let r = JSON.parse(e.data); if (r.id === mid) { ws.removeEventListener('message', h); res(r); } } catch{} };
        ws.addEventListener('message', h);
        setTimeout(() => { ws.removeEventListener('message', h); res({}); }, 5000);
    });
}

// Look for buttons between the main content area and player bar (track info area)
const r = await send('Runtime.evaluate', { expression: `(function(){
    var allButtons = document.querySelectorAll('button');
    var results = [];
    var winH = window.innerHeight;
    
    // Focus on area between 60% and 90% of screen height (track info + player bar top)
    for (var btn of allButtons) {
        var rect = btn.getBoundingClientRect();
        if (rect.top > winH * 0.6 && rect.top < winH - 50 && rect.width > 15 && rect.height > 15) {
            var label = btn.getAttribute('aria-label') || '';
            var cn = typeof btn.className === 'string' ? btn.className : '';
            results.push('y=' + Math.round(rect.top) + ' x=' + Math.round(rect.x) + ' w=' + Math.round(rect.width) + ' aria="' + label + '" class="' + cn.substring(0,30) + '"');
        }
    }
    results.sort(function(a,b) {
        var ya = parseInt(a.match(/y=(\\d+)/)[1]);
        var yb = parseInt(b.match(/y=(\\d+)/)[1]);
        return ya - yb;
    });
    return results.join('\\n');
})()`, returnByValue: true });
console.log('Buttons in lower area:');
console.log(r?.result?.result?.value || JSON.stringify(r));

// Also look at the player track info section specifically
const info = await send('Runtime.evaluate', { expression: `(function(){
    // Find the track title and artist in player
    var lines = document.body.innerText.split('\\n').filter(l => l.trim());
    var playerIdx = lines.indexOf('Плеер');
    if (playerIdx >= 0) {
        return 'Player area:\\n' + lines.slice(playerIdx, playerIdx+5).join('\\n');
    }
    return 'no player section';
})()`, returnByValue: true });
console.log('\\nPlayer info:', info?.result?.result?.value);

ws.close();
