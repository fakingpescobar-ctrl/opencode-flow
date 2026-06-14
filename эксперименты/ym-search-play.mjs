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
console.log('Connecting...');
const ws = await connectCDP(page.webSocketDebuggerUrl);

// Navigate to search
await send(ws, 'Page.navigate', { url: `music-application://desktop/search?text=${encodeURIComponent(query)}` });
await sleep(5000);

// Try to click first playable track
const js = `(function(){
    // Try various selectors for play buttons
    var selectors = [
        '[data-test-id=play-button]',
        '[data-test-class=play-button]',
        'button.d-track__play-btn',
        '[data-test=play]',
        '[aria-label=Play]',
        '[aria-label=\\"Слушать\\"]',
        // Try clicking the first track in results
        'div[data-test-class=track] a',
        'div[data-test-class=track] button',
        '.d-track:first-child .d-track__play-btn',
        'li:first-child .d-track__play-btn',
    ];
    for (var s of selectors) {
        var el = document.querySelector(s);
        if (el) { el.click(); return 'Clicked: ' + s; }
    }
    // Try to find any track title and click it
    var links = document.querySelectorAll('a[href*="/track/"]');
    if (links.length > 0) { links[0].click(); return 'Clicked track link'; }
    // Try clicking the first result item
    var items = document.querySelectorAll('[data-test-class=track], .d-track, .track-item, [role=listitem]');
    if (items.length > 0) {
        var btn = items[0].querySelector('button, a');
        if (btn) { btn.click(); return 'Clicked first item button'; }
    }
    // Show what's on page
    var body = document.body?.innerText?.substring(0, 300) || 'empty';
    return 'No play button found. Page: ' + body;
})()`;

const result = await send(ws, 'Runtime.evaluate', { expression: js, returnByValue: true });
console.log('Result:', result?.result?.result?.value);
await sleep(1000);
ws.close();
