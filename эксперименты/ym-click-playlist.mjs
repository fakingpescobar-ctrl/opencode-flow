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

// Navigate to search
await send(ws, 'Page.navigate', { url: `music-application://desktop/search?text=${encodeURIComponent(query)}` });
await sleep(5000);

const js = `(function(){
    var items = document.body?.querySelectorAll('div, a, button, li, span');
    if (!items) return 'no body';
    for (var i = 0; i < items.length; i++) {
        var text = items[i].innerText?.trim() || '';
        // Click "Лучшее: Скриптонит" playlist
        if (text === 'Лучшее: Скриптонит') {
            items[i].click();
            return 'Clicked: ' + text;
        }
        // Or "Моя волна по исполнителю"
        if (text === 'Моя волна по исполнителю') {
            items[i].click();
            return 'Clicked: ' + text;
        }
    }
    // Try to find any clickable element with "Скриптонит"
    for (var i = 0; i < items.length; i++) {
        var text = items[i].innerText?.trim() || '';
        if (text === 'Скриптонит' && items[i].tagName === 'A') {
            items[i].click();
            return 'Clicked artist link';
        }
    }
    return 'no match found';
})()`;

const result = await send(ws, 'Runtime.evaluate', { expression: js, returnByValue: true });
console.log('Result:', result?.result?.result?.value);
await sleep(3000);
// Now press play
const play = await send(ws, 'Runtime.evaluate', {
    expression: `(function(){
        var btns = document.querySelectorAll('button');
        for (var b of btns) {
            if (b.innerText.includes('Play') || b.innerText.includes('Слушать') || b.getAttribute('aria-label') === 'Play') {
                b.click(); return 'Play clicked';
            }
        }
        return 'no play button';
    })()`,
    returnByValue: true
});
console.log('Play:', play?.result?.result?.value);
await sleep(1000);
ws.close();
