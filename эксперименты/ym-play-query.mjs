import http from 'node:http';
const query = process.argv.slice(2).join(' ') || 'Скриптонит Что ты знаешь об этом';
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
        setTimeout(() => { ws.removeEventListener('message', handler); reject('timeout'); }, 15000);
    });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const targets = await getTargets();
const page = targets.find(t => t.type === 'page' && t.url.includes('music-application'));
const ws = await connectCDP(page.webSocketDebuggerUrl);

// Navigate to search
await send(ws, 'Page.navigate', { url: `music-application://desktop/search?text=${encodeURIComponent(query)}` });
await sleep(5000);

// Find link to exact track and click play
const r = await send(ws, 'Runtime.evaluate', {
    expression: `(function(){
        var links = document.querySelectorAll('a[href*="/album/track"]');
        for (var link of links) {
            var txt = (link.innerText||'').trim();
            if (txt.includes('Что ты знаешь об этом') || txt.includes('знаешь об этом')) {
                // Find nearest play button
                var p = link.parentElement;
                for (var i = 0; i < 10 && p; i++) {
                    var play = p.querySelector('button[aria-label="Воспроизведение"]');
                    if (play) { play.click(); return 'found: ' + txt; }
                    p = p.parentElement;
                }
                link.click();
                return 'link: ' + txt;
            }
        }
        // Fallback: click first track
        var first = links[0];
        if (first) {
            var p = first.parentElement;
            for (var i = 0; i < 10 && p; i++) {
                var play = p.querySelector('button[aria-label="Воспроизведение"]');
                if (play) { play.click(); return 'first: ' + (first.innerText||'').trim(); }
                p = p.parentElement;
            }
            first.click();
            return 'first link: ' + (first.innerText||'').trim();
        }
        return 'not found';
    })()`,
    returnByValue: true
});
console.log('Result:', r?.result?.result?.value);
ws.close();
