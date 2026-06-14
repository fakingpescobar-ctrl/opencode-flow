import http from 'node:http';
const query = process.argv.slice(2).join(' ') || 'Скриптонит';
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

await send(ws, 'Page.navigate', { url: `music-application://desktop/search?text=${encodeURIComponent(query)}` });
await sleep(5000);

// Click play button next to first track
const js = `(function(){
    var links = document.querySelectorAll('a[href*="/album/track"]');
    if (links.length > 0) {
        var link = links[0];
        // Find closest play button
        var parent = link.parentElement;
        for (var i = 0; i < 10 && parent; i++) {
            var play = parent.querySelector('button[aria-label="Воспроизведение"]');
            if (play) { play.click(); return 'Play clicked for: ' + (link.innerText||'').trim(); }
            parent = parent.parentElement;
        }
        // Just click the link itself
        link.click();
        return 'Link clicked: ' + (link.innerText||'').trim();
    }
    return 'no tracks found';
})()`;

const result = await send(ws, 'Runtime.evaluate', { expression: js, returnByValue: true });
console.log('Result:', result?.result?.result?.value);
await sleep(2000);
ws.close();
