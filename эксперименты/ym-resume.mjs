import http from 'node:http';
const data = await new Promise(r => http.get('http://localhost:9222/json', res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); }));
const page = data.find(t => t.type === 'page' && t.url.includes('music-application'));
if (!page) { console.log('no page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 1;
function send(m, p) {
    return new Promise((res) => {
        let mid = id++; ws.send(JSON.stringify({id:mid, method:m, params:p}));
        let h = e => { try { let r = JSON.parse(e.data); if (r.id === mid) { ws.removeEventListener('message', h); res(r); } } catch{} };
        ws.addEventListener('message', h);
        setTimeout(() => { ws.removeEventListener('message', h); res({}); }, 10000);
    });
}

// Check player status
const r = await send('Runtime.evaluate', {
    expression: `(function(){
        var lines = document.body.innerText.split('\\n').filter(x => x.trim());
        var idx = lines.indexOf('Плеер');
        return idx >= 0 ? lines.slice(idx, idx+6).join(' | ') : 'no player: ' + lines.slice(0,10).join(', ');
    })()`,
    returnByValue: true
});
console.log('Player:', r?.result?.result?.value);

// Click play
const r2 = await send('Runtime.evaluate', {
    expression: `(function(){
        var all = document.querySelectorAll('[data-test-id=PLAY_BUTTON]');
        var b = all[all.length - 1];
        if (!b) return 'not found';
        b.click();
        return 'clicked ' + b.getAttribute('aria-label');
    })()`,
    returnByValue: true
});
console.log('Play:', r2?.result?.result?.value);
console.log('Action:', r2?.result?.result?.value);

await new Promise(r => setTimeout(r, 1000));

// Check again
const r3 = await send('Runtime.evaluate', {
    expression: `(function(){
        var lines = document.body.innerText.split('\\n').filter(x => x.trim());
        var idx = lines.indexOf('Плеер');
        return idx >= 0 ? lines.slice(idx, idx+6).join(' | ') : 'still no player';
    })()`,
    returnByValue: true
});
console.log('After:', r3?.result?.result?.value);

ws.close();
