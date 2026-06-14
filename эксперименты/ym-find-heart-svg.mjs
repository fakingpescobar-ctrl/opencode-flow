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

// 1. Find ALL SVG paths and look for heart patterns
const r = await send('Runtime.evaluate', { expression: `(function(){
    var allPaths = document.querySelectorAll('path');
    var hearts = [];
    for (var p of allPaths) {
        var d = p.getAttribute('d') || '';
        // Heart SVGs: M12...C... (heart outline), or filled heart
        if ((d.includes('M12') && d.includes('C') && (d.includes('l-1.45') || d.includes('21.35') || d.includes('18-2') || d.includes('9.73')))) {
            var svg = p.closest('svg');
            var btn = p.closest('button') || p.closest('[role=button]');
            var rect = (svg || p).getBoundingClientRect();
            hearts.push('HEART d="' + d.substring(0,50) + '..." x=' + Math.round(rect.x) + ' y=' + Math.round(rect.y) + ' btn=' + (btn ? 'yes' : 'no'));
        }
    }
    return hearts.join('\\n') || 'no heart SVGs found';
})()`, returnByValue: true });
console.log('Heart SVGs:');
console.log(r?.result?.result?.value || JSON.stringify(r));

// 2. Also get ALL path data from the bottom player area to identify buttons
const paths = await send('Runtime.evaluate', { expression: `(function(){
    var allPaths = document.querySelectorAll('path');
    var results = [];
    for (var p of allPaths) {
        var svg = p.closest('svg');
        if (!svg) continue;
        var rect = svg.getBoundingClientRect();
        if (rect.top > window.innerHeight - 150 && rect.width > 0) {
            var d = (p.getAttribute('d') || '').substring(0, 60);
            results.push('y=' + Math.round(rect.top) + ' x=' + Math.round(rect.x) + ' d="' + d + '..."');
        }
    }
    results.sort(function(a,b) {
        return parseInt(a.match(/y=(\\d+)/)[1]) - parseInt(b.match(/y=(\\d+)/)[1]);
    });
    return results.join('\\n');
})()`, returnByValue: true });
console.log('\\nPlayer bar SVGs:');
console.log(paths?.result?.result?.value || JSON.stringify(paths));

ws.close();
