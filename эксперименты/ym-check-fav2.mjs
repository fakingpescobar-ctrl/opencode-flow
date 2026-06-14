import http from 'node:http';
const data = await new Promise(r => http.get('http://localhost:9222/json', res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); }));
const page = data.find(t => t.type === 'page' && t.url.includes('music-application'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 1;
function send(m, p) {
    return new Promise((res) => {
        let mid = id++; ws.send(JSON.stringify({id:mid, method:m, params:p}));
        let h = e => { try { let r = JSON.parse(e.data); if (r.id === mid) { ws.removeEventListener('message', h); res(r); } } catch{} };
        ws.addEventListener('message', h);
        setTimeout(() => { ws.removeEventListener('message', h); res({}); }, 15000);
    });
}

// Go to collection
const clickR = await send('Runtime.evaluate', {
    expression: `(function(){
        for (let s of document.querySelectorAll('span'))
            if (s.innerText?.trim() === 'Коллекция') {
                let el = s;
                while (el && el !== document.body) {
                    if (window.getComputedStyle(el).cursor === 'pointer') { el.click(); return 'ok'; }
                    el = el.parentElement;
                }
            }
        return 'not found';
    })()`,
    returnByValue: true
});
console.log('Click:', clickR?.result?.result?.value);

// Wait for navigation
await new Promise(r => setTimeout(r, 3000));

// Check count
const checkR = await send('Runtime.evaluate', {
    expression: `(function(){
        var lines = document.body.innerText.split('\\n').filter(function(l){return l.trim()});
        var idx = lines.indexOf('Мне нравится');
        if (idx >= 0) {
            return lines.slice(idx, idx+5).join(' || ');
        }
        return 'not found: ' + lines.slice(0, 20).join(', ');
    })()`,
    returnByValue: true
});
console.log('Collection:', checkR?.result?.result?.value);
ws.close();
