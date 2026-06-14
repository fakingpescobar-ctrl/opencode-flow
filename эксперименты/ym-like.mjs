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

const r = await send('Runtime.evaluate', { expression: `(function(){
    var all = document.querySelectorAll('*');
    for (var el of all) {
        var cn = typeof el.className === 'string' ? el.className : '';
        if (cn && (cn.includes('like') || cn.includes('Like'))) {
            var rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.top > 0 && rect.top < window.innerHeight) {
                el.click();
                return 'clicked: ' + cn.substring(0,60);
            }
        }
    }
    // Try buttons
    var btns = document.querySelectorAll('button');
    for (var btn of btns) {
        var label = btn.getAttribute('aria-label') || btn.getAttribute('title') || '';
        if (label.toLowerCase().includes('like') || label.toLowerCase().includes('нравится') || label.toLowerCase().includes('лайк')) {
            btn.click();
            return 'clicked button: ' + label;
        }
    }
    return 'no like found. btns: ' + btns.length;
})()`, returnByValue: true });
console.log(r?.result?.result?.value || JSON.stringify(r));
ws.close();
