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

// Go to collection
await send('Runtime.evaluate', { expression: `(function(){
    for (let s of document.querySelectorAll('span'))
        if (s.innerText?.trim() === 'Коллекция') {
            let el = s;
            while (el && el !== document.body) {
                if (window.getComputedStyle(el).cursor === 'pointer') { el.click(); return 'opened'; }
                el = el.parentElement;
            }
        }
    return 'not found';
})()`, returnByValue: true });
await new Promise(r => setTimeout(r, 2000));

// Get the "Мне нравится" section content
const r = await send('Runtime.evaluate', { expression: `(function(){
    var text = document.body.innerText;
    var lines = text.split('\\n').filter(l => l.trim());
    var idx = lines.indexOf('Мне нравится');
    if (idx >= 0) {
        var result = [];
        result.push('Count: ' + (lines[idx+1] || '?'));
        var tracks = lines.slice(idx+2, idx+22);
        result.push('First 20 tracks:');
        tracks.forEach(function(t, i) { result.push((i+1) + '. ' + t); });
        return result.join('\\n');
    }
    return 'not found';
})()`, returnByValue: true });
console.log(r?.result?.result?.value || '');
ws.close();
