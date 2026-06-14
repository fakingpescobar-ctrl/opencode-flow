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

// Find all clickable elements in the player bar area (bottom of page)
const r = await send('Runtime.evaluate', { expression: `(function(){
    var all = document.querySelectorAll('*');
    var results = [];
    for (var el of all) {
        var cn = typeof el.className === 'string' ? el.className : '';
        var rect = el.getBoundingClientRect();
        // Looking in player bar area - bottom 100px of page
        if (rect.top > window.innerHeight - 120 && rect.width > 20 && rect.height > 20) {
            if (cn && (cn.includes('like') || cn.includes('Like') || cn.includes('heart') || cn.includes('Heart') || 
                cn.includes('favorite') || cn.includes('Favorite') || cn.includes('dislike') || cn.includes('Dislike'))) {
                results.push('tag=' + el.tagName + ' class="' + cn.substring(0,40) + '" text="' + (el.innerText||'').trim().substring(0,15) + '" rect=' + rect.x + ',' + rect.y + '-' + rect.w + 'x' + rect.h);
            }
        }
    }
    return results.join('\\n') || 'no like elements in player bar';
})()`, returnByValue: true });
console.log('Player bar like elements:');
console.log(r?.result?.result?.value || JSON.stringify(r));

// Also check buttons specifically
const r2 = await send('Runtime.evaluate', { expression: `(function(){
    var btns = document.querySelectorAll('button');
    var results = [];
    for (var btn of btns) {
        var rect = btn.getBoundingClientRect();
        if (rect.top > window.innerHeight - 120 && rect.width > 0 && rect.height > 0) {
            results.push('btn class="' + (typeof btn.className === 'string' ? btn.className.substring(0,40) : '') + '" inner="' + (btn.innerText||'').trim().substring(0,15) + '" rect=' + Math.round(rect.x) + ',' + Math.round(rect.y) + '-' + Math.round(rect.w) + 'x' + Math.round(rect.h));
        }
    }
    return results.join('\\n') || 'no buttons';
})()`, returnByValue: true });
console.log('\\nPlayer bar buttons:');
console.log(r2?.result?.result?.value || JSON.stringify(r2));

ws.close();
