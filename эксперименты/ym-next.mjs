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
await send(ws, 'Runtime.evaluate', {
    expression: `(function(){
        var all = document.querySelectorAll('button');
        for (var b of all) {
            var aria = b.getAttribute('aria-label') || '';
            if (aria.includes('Следующая') || aria === 'Next') {
                b.click();
                return 'next ok';
            }
        }
        for (var b of all) {
            var cls = b.className || '';
            if (cls.includes('next') || cls.includes('skip')) {
                b.click();
                return 'next ok (class)';
            }
        }
        return 'not found';
    })()`,
    returnByValue: true
});
ws.close();
