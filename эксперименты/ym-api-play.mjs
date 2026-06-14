import http from 'node:http';
const query = process.argv.slice(2).join(' ') || 'Скриптонит';
const CDP_PORT = 9222;
function getTargets() {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${CDP_PORT}/json`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
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
            try {
                const r = JSON.parse(e.data.toString());
                if (r.id === id) { ws.removeEventListener('message', handler); resolve(r); }
            } catch {}
        };
        ws.addEventListener('message', handler);
        setTimeout(() => { ws.removeEventListener('message', handler); reject('timeout'); }, 15000);
    });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const targets = await getTargets();
const page = targets.find(t => t.type === 'page' && t.url.includes('music-application'));
const ws = await connectCDP(page.webSocketDebuggerUrl);

// Search via YM API then play first track
const js = `
(async function() {
    try {
        var r = await fetch('https://api.music.yandex.net/search?text=' + encodeURIComponent('${query}') + '&type=track');
        var data = await r.json();
        var tracks = data?.result?.tracks?.results || [];
        if (tracks.length > 0) {
            var t = tracks[0];
            var title = (t.artists||[]).map(function(a){return a.name}).join(', ') + ' - ' + t.title;
            document.title = 'CUSTOM: ' + title;
            // Try direct player api
            if (window.player && window.player.play) {
                window.player.play(t.id);
            }
        } else {
            document.title = 'CUSTOM: no results';
        }
    } catch(e) {
        document.title = 'CUSTOM: ' + e.message;
    }
})();
`;

const result = await send(ws, 'Runtime.evaluate', { expression: js, returnByValue: false });
await sleep(3000);
const titleResult = await send(ws, 'Runtime.evaluate', { expression: 'document.title', returnByValue: true });
console.log('Title:', titleResult?.result?.result?.value || 'no response');
ws.close();
