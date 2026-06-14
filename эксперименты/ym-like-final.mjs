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

// Click button with aria-label "Нравится"
await send('Runtime.evaluate', {
    expression: `document.querySelector('button[aria-label="Нравится"]')?.click()`,
    returnByValue: true
});
console.log('Clicked like');

await new Promise(r => setTimeout(r, 1500));

// Verify - check if the "like" counter changed
const verify = await send('Runtime.evaluate', {
    expression: `(function(){
        var btns = document.querySelectorAll('button');
        for (var btn of btns) {
            var label = btn.getAttribute('aria-label') || '';
            if (label.includes('лайк') || label.includes('Нравится')) {
                return 'Found: ' + label + ' | count: ' + (btn.innerText||'').trim();
            }
        }
        return 'not found';
    })()`,
    returnByValue: true
});
console.log('Verify:', verify?.result?.result?.value);

// Check collection count
const count = await send('Runtime.evaluate', {
    expression: `(function(){
        var text = document.body.innerText;
        var idx = text.indexOf('Мне нравится');
        if (idx >= 0) {
            var lines = text.substring(idx).split('\\n');
            return 'Likes: ' + (lines[1] || '?');
        }
        return 'not found';
    })()`,
    returnByValue: true
});
console.log('Collection:', count?.result?.result?.value);

ws.close();
