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
        // Find next button (known to be in player bar), then get nearby text
        var btns = document.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
            var aria = btns[i].getAttribute('aria-label')||'';
            if (aria.includes('Следующая')) {
                // Walk up to player container and get all text
                var p = btns[i];
                for (var j = 0; j < 10; j++) {
                    p = p.parentElement;
                    if (!p) break;
                    var txt = p.innerText?.trim();
                    if (txt && txt.length > 3) {
                        return txt.replace(/\\n/g, ' | ').substring(0, 300);
                    }
                }
            }
        }
        // Fallback: search by known text patterns
        var all = document.querySelectorAll('span, div, a');
        var candidates = [];
        for (var el of all) {
            var t = (el.innerText||'').trim();
            if (t && t.length > 2 && t.length < 200 && el.children.length === 0) {
                candidates.push(t);
            }
        }
        return 'found spans: ' + candidates.slice(-20).join(' | ');
    })()`,
    returnByValue: true
});
console.log('Now playing:', r?.result?.result?.value || '?');
ws.close();
