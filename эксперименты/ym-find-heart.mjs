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

// Look for buttons near the track info section in player (top half of player)
const r = await send('Runtime.evaluate', { expression: `(function(){
    var btns = document.querySelectorAll('button');
    var results = [];
    for (var btn of btns) {
        var cn = typeof btn.className === 'string' ? btn.className : '';
        var rect = btn.getBoundingClientRect();
        // Player area: between 800px from top and window height
        if (rect.top > 800 && rect.top < window.innerHeight && rect.width > 20) {
            var label = btn.getAttribute('aria-label') || '';
            if (label.includes('like') || label.includes('Like') || label.includes('Нравится') || label.includes('нравится') || label.includes('heart') || label.includes('Heart') || label.includes('лайк') || label.includes('favorite') || label.includes('Favorite')) {
                results.push('FOUND: x=' + Math.round(rect.x) + ' y=' + Math.round(rect.y) + ' label="' + label + '" class="' + cn.substring(0,40) + '"');
            }
        }
    }
    // Also check any button with SVG heart path
    for (var btn of document.querySelectorAll('button')) {
        var rect = btn.getBoundingClientRect();
        if (rect.top > 800 && rect.top < window.innerHeight) {
            var svg = btn.querySelector('svg');
            if (svg) {
                var html = svg.innerHTML || '';
                // Heart SVG paths typically contain specific patterns
                if (html.includes('M12') && (html.includes('l-') || html.includes('a1'))) {
                    results.push('HEART SVG: x=' + Math.round(rect.x) + ' y=' + Math.round(rect.y) + ' class="' + (typeof btn.className === 'string' ? btn.className.substring(0,40) : '') + '" label="' + (btn.getAttribute('aria-label')||'') + '"');
                }
            }
        }
    }
    // Check for track title and artist area - like button is usually near them
    var trackTitle = document.querySelector('[class*=player] [class*=title], [class*=Player] [class*=Title]');
    if (trackTitle) {
        var tr = trackTitle.getBoundingClientRect();
        var nearBtns = [];
        for (var btn of document.querySelectorAll('button')) {
            var br = btn.getBoundingClientRect();
            if (Math.abs(br.top - tr.top) < 50 && br.left > tr.right) {
                nearBtns.push('NEAR TRACK: x=' + Math.round(br.x) + ' y=' + Math.round(br.y) + ' label="' + (btn.getAttribute('aria-label')||'') + '"');
            }
        }
        results = results.concat(nearBtns);
    }
    return results.join('\\n') || 'no like/heart buttons found';
})()`, returnByValue: true });
console.log(r?.result?.result?.value || JSON.stringify(r));

// Also dump all buttons in bottom area with their basic info
const all = await send('Runtime.evaluate', { expression: `(function(){
    var btns = document.querySelectorAll('button');
    var r = [];
    for (var btn of btns) {
        var rect = btn.getBoundingClientRect();
        if (rect.top > window.innerHeight - 200) {
            r.push('x=' + Math.round(rect.x) + ' y=' + Math.round(rect.y) + ' w=' + Math.round(rect.width) + ' aria="' + (btn.getAttribute('aria-label')||'') + '"');
        }
    }
    return r.join('\\n');
})()`, returnByValue: true });
console.log('\\nAll bottom buttons:');
console.log(all?.result?.result?.value || '');

ws.close();
