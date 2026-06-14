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

// Click the "Нравится" button properly
const clickResult = await send('Runtime.evaluate', {
    expression: `(function(){
        var btn = document.querySelector('button[aria-label="Нравится"]');
        if (!btn) return 'button not found';
        // Use mouse events for proper click
        var rect = btn.getBoundingClientRect();
        btn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, clientX: rect.x+rect.width/2, clientY: rect.y+rect.height/2}));
        btn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, clientX: rect.x+rect.width/2, clientY: rect.y+rect.height/2}));
        btn.dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: rect.x+rect.width/2, clientY: rect.y+rect.height/2}));
        return 'clicked with mouse events';
    })()`,
    returnByValue: true
});
console.log('Click:', clickResult?.result?.result?.value);

await new Promise(r => setTimeout(r, 2000));

// Navigate to collection
await send('Runtime.evaluate', {
    expression: `(function(){
        for (let s of document.querySelectorAll('span'))
            if (s.innerText?.trim() === 'Коллекция') {
                let el = s;
                while (el && el !== document.body) {
                    if (window.getComputedStyle(el).cursor === 'pointer') { el.click(); return 'nav to collection'; }
                    el = el.parentElement;
                }
            }
        return 'not found';
    })()`,
    returnByValue: true
});
await new Promise(r => setTimeout(r, 2000));

// Check count
const check = await send('Runtime.evaluate', {
    expression: `(function(){
        var text = document.body.innerText;
        var idx = text.indexOf('Мне нравится');
        if (idx >= 0) {
            var lines = text.substring(idx).split('\\n');
            return 'Likes: ' + (lines[1] || '?') + '\\nFirst few tracks:\\n' + lines.slice(2, 7).join('\\n');
        }
        return 'not found';
    })()`,
    returnByValue: true
});
console.log(check?.result?.result?.value || '');

ws.close();
