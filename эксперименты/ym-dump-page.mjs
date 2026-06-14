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

// Dump all buttons
const js = `(function(){
    var r = [];
    var btns = document.querySelectorAll('button');
    r.push('=== BUTTONS (' + btns.length + ') ===');
    btns.forEach(function(b, i) {
        r.push(i + ': text="' + (b.innerText||'').trim() + '" aria="' + (b.getAttribute('aria-label')||'') + '" cls="' + (b.className||'').substring(0,50) + '"');
    });
    var links = document.querySelectorAll('a');
    r.push('=== LINKS ===');
    links.forEach(function(l, i) {
        r.push(i + ': text="' + (l.innerText||'').trim() + '" href="' + (l.getAttribute('href')||'').substring(0,60) + '"');
    });
    // Dump spans with track names
    var spans = document.querySelectorAll('span');
    r.push('=== SPANS (track-related) ===');
    spans.forEach(function(s, i) {
        var t = (s.innerText||'').trim();
        if (t && t.length < 100 && s.children.length === 0) {
            r.push('"' + t.substring(0,50) + '"');
        }
    });
    return r.join('\\n');
})()`;

const result = await send(ws, 'Runtime.evaluate', { expression: js, returnByValue: true });
console.log(result?.result?.result?.value || 'no output');
ws.close();
