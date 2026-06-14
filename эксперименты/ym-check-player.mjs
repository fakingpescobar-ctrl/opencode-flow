import http from 'node:http';
function getTargets() {
    return new Promise((resolve, reject) => {
        http.get('http://localhost:9222/json', (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
    });
}
function connectCDP(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.addEventListener('open', () => resolve(ws));
        ws.addEventListener('error', reject);
        setTimeout(() => reject('timeout'), 5000);
    });
}
function send(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 100000);
        ws.send(JSON.stringify({ id, method, params }));
        const handler = (e) => {
            try { const r = JSON.parse(e.data.toString()); if (r.id === id) { ws.removeEventListener('message', handler); resolve(r); } } catch {}
        };
        ws.addEventListener('message', handler);
        setTimeout(() => { ws.removeEventListener('message', handler); reject('timeout'); }, 10000);
    });
}

const targets = await getTargets();
const page = targets.find(t => t.type === 'page' && t.url.includes('music-application'));
const ws = await connectCDP(page.webSocketDebuggerUrl);

const r = await send(ws, 'Runtime.evaluate', {
    expression: `(function(){
        var title = document.querySelector('.player-controls__track-name, .track__title, .d-track__name');
        var artist = document.querySelector('.player-controls__artist-name, .track__artists, .d-track__artists');
        var txt = document.body?.innerText?.substring(0, 200) || '';
        return 'Playing: ' + (artist?.innerText||'?') + ' - ' + (title?.innerText||'?') + ' | Page: ' + txt.substring(0,100);
    })()`,
    returnByValue: true
});
console.log('Status:', r?.result?.result?.value || 'none');
ws.close();
