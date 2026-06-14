import http from 'node:http';
const query = process.argv.slice(2).join(' ') || 'Скриптонит';
const targets = await new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); }).on('error',reject);
});
const page = targets.find(t => t.type === 'page' && t.url.includes('music-application'));
const ws = await new Promise((resolve, reject) => {
    const w = new WebSocket(page.webSocketDebuggerUrl);
    w.addEventListener('open', () => resolve(w));
    w.addEventListener('error', reject);
    setTimeout(() => reject('timeout'), 5000);
});
function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 100000);
        const msg = JSON.stringify({ id, method, params });
        ws.send(msg);
        const handler = (e) => {
            try { const r = JSON.parse(e.data.toString()); if (r.id === id) { ws.removeEventListener('message', handler); resolve(r); } } catch {}
        };
        ws.addEventListener('message', handler);
        setTimeout(() => { ws.removeEventListener('message', handler); reject('timeout'); }, 10000);
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Navigate to search
await send('Page.navigate', { url: `music-application://desktop/search?text=${encodeURIComponent(query)}` });
await sleep(4000);
// Try to click first play button
try {
    const result = await send('Runtime.evaluate', {
        expression: `(function(){
            let btn = document.querySelector('[data-test-id=play-button]');
            if (!btn) {
                let tracks = document.querySelectorAll('[data-test-class=track]');
                if (tracks.length > 0) {
                    let playBtn = tracks[0].querySelector('button');
                    if (playBtn) playBtn.click();
                }
            } else { btn.click(); }
            return 'ok';
        })()`,
        returnByValue: true
    });
    console.log('Result:', JSON.stringify(result?.result?.result?.value));
} catch (e) {
    console.log('Error:', e.message);
}
await sleep(1000);
ws.close();
console.log('Done');
