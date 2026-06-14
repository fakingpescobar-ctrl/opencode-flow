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

// Get detail about all player bar buttons - their inner SVGs, text, positions
const r = await send('Runtime.evaluate', { expression: `(function(){
    var btns = document.querySelectorAll('button');
    var results = [];
    for (var btn of btns) {
        var rect = btn.getBoundingClientRect();
        if (rect.top > window.innerHeight - 150 && rect.width > 20) {
            // Get all SVG path data
            var paths = btn.querySelectorAll('path');
            var pathData = '';
            paths.forEach(function(p) { pathData += (p.getAttribute('d')||'').substring(0,30) + ' '; });
            var label = btn.getAttribute('aria-label') || '';
            var text = (btn.innerText||'').trim().substring(0,10);
            results.push('x=' + Math.round(rect.x) + ' y=' + Math.round(rect.y) + ' w=' + Math.round(rect.width) + ' label="' + label + '" text="' + text + '" paths="' + pathData.substring(0,40) + '" class="' + (typeof btn.className === 'string' ? btn.className.substring(0,20) : '') + '"');
        }
    }
    results.sort(function(a,b) { 
        var xa = parseInt(a.match(/x=(\\d+)/)[1]); 
        var xb = parseInt(b.match(/x=(\\d+)/)[1]); 
        return xa - xb; 
    });
    return results.join('\\n');
})()`, returnByValue: true });
console.log(r?.result?.result?.value || JSON.stringify(r));
ws.close();
