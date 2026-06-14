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

// Find heart-shaped SVGs: YM heart SVG paths often have specific patterns
// Heart path example: M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z
const r = await send('Runtime.evaluate', { expression: `(function(){
    var results = [];
    
    // Find all SVG elements  
    var svgs = document.querySelectorAll('svg');
    for (var svg of svgs) {
        var html = svg.innerHTML || '';
        // Heart SVG typically has specific path pattern
        if (html.includes('M12') && html.includes('21.35') || html.includes('l-1.45')) {
            var rect = svg.getBoundingClientRect();
            var btn = svg.closest('button');
            results.push('HEART SVG: x=' + Math.round(rect.x) + ' y=' + Math.round(rect.y) + ' w=' + Math.round(rect.width) + ' btn=' + (btn ? 'yes aria="' + (btn.getAttribute('aria-label')||'') + '"' : 'no'));
        }
    }
    
    // Alternative: look for button with data属性的heart
    var all = document.querySelectorAll('[class*=like], [class*=heart], [class*=favorite], [class*=Like], [class*=Heart], [class*=Favorite]');
    for (var el of all) {
        var rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            var cn = typeof el.className === 'string' ? el.className.substring(0,40) : '';
            results.push('CLASS: tag=' + el.tagName + ' cls="' + cn + '" x=' + Math.round(rect.x) + ' y=' + Math.round(rect.y));
        }
    }
    
    return results.join('\\n') || 'no hearts found';
})()`, returnByValue: true });
console.log(r?.result?.result?.value || JSON.stringify(r));

// Secondary: look for button in player section that could be like
const r2 = await send('Runtime.evaluate', { expression: `(function(){
    // Find track title/artist text elements and check their siblings for heart
    var all = document.querySelectorAll('*');
    for (var el of all) {
        if (el.children?.length === 0 && el.innerText?.trim() === 'Maybe We Crazy') {
            var p = el.parentElement;
            var depth = 0;
            while (p && p !== document.body && depth < 8) {
                var btns = p.querySelectorAll('button');
                if (btns.length > 0) {
                    return 'Found ' + btns.length + ' buttons near track title at depth ' + depth + ': ' + 
                        Array.from(btns).map(function(b){return '"'+(b.getAttribute('aria-label')||b.innerText?.trim().substring(0,10)||'no-label')+'"'}).join(', ');
                }
                p = p.parentElement;
                depth++;
            }
        }
    }
    return 'not found';
})()`, returnByValue: true });
console.log('\\nNear track:', r2?.result?.result?.value);

ws.close();
