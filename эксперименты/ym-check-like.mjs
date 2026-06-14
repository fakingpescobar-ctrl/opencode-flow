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

// Navigate to collection via sidebar
await send('Runtime.evaluate', { expression: `(function(){
    for (let s of document.querySelectorAll('span'))
        if (s.innerText?.trim() === 'Коллекция') {
            let el = s;
            while (el && el !== document.body) {
                if (window.getComputedStyle(el).cursor === 'pointer') { el.click(); return 'ok'; }
                el = el.parentElement;
            }
        }
    return 'not found';
})()`, returnByValue: true });
await new Promise(r => setTimeout(r, 2000));

// Check "Мне нравится" count and see if our track is in the visible list
const r = await send('Runtime.evaluate', { expression: `(function(){
    var text = document.body.innerText;
    var lines = text.split('\\n').filter(l => l.trim());
    // Find line with "Мне нравится"
    var idx = lines.indexOf('Мне нравится');
    if (idx >= 0) {
        return 'Мне нравится: ' + lines[idx+1] + '\\nFirst 15 tracks:\\n' + lines.slice(idx+2, idx+17).join('\\n');
    }
    return 'not found';
})()`, returnByValue: true });
console.log(r?.result?.result?.value || JSON.stringify(r));

// Also check if any element has an "active" like state
const state = await send('Runtime.evaluate', { expression: `(function(){
    var all = document.querySelectorAll('*');
    for (var el of all) {
        var cn = typeof el.className === 'string' ? el.className : '';
        if (cn.includes('like') && (cn.includes('active') || cn.includes('Active') || cn.includes('selected') || cn.includes('Selected'))) {
            return 'Found active like element';
        }
    }
    return 'no active like indicator';
})()`, returnByValue: true });
console.log('Like state:', state?.result?.result?.value);

ws.close();
