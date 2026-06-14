import http from 'node:http';
const data = await new Promise(r => http.get('http://localhost:9222/json', res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); }));
const page = data.find(t => t.type === 'page' && t.url.includes('music-application'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 1;
function send(m, p) {
    return new Promise(res => {
        let mid = id++; ws.send(JSON.stringify({id:mid, method:m, params:p}));
        let h = e => { try { let r = JSON.parse(e.data); if (r.id === mid) { ws.removeEventListener('message', h); res(r); } } catch{} };
        ws.addEventListener('message', h);
        setTimeout(() => { ws.removeEventListener('message', h); res({}); }, 5000);
    });
}

// First, get the current track info to find track ID
// Then use the YM internal API to like it

const r = await send('Runtime.evaluate', { expression: `(function(){
    var text = document.body.innerText;
    var lines = text.split('\\n').filter(l => l.trim());
    var pi = lines.indexOf('Плеер');
    if (pi >= 0) {
        return 'Player: ' + lines.slice(pi, pi+3).join(' | ');
    }
    return 'no player';
})()`, returnByValue: true });
console.log('Current:', r?.result?.result?.value);

// Try to call YM API to like current track
// The YM desktop app uses the same API: POST /users/{uid}/likes/tracks/add-multiple
const likeViaApi = await send('Runtime.evaluate', { expression: `(async function(){
    try {
        // Get current track info from the player state
        // YM stores player state in window.__INITIAL_STATE__ or similar
        var state = window.__INITIAL_STATE__ || window.__DATA__ || window.__NEXT_DATA__;
        if (state) return 'found state: ' + JSON.stringify(state).substring(0,200);
        
        // Alternative: use YM's internal API via fetch
        // First get the current track metadata
        var resp = await fetch('https://api.music.yandex.net/account/status');
        var account = await resp.json();
        var uid = account?.result?.account?.uid;
        
        // Get currently playing track - look for it in the DOM or player state
        // YM stores queue in window.player or in Redux store
        var playerEl = document.querySelector('[class*=nowPlaying], [class*=NowPlaying]');
        var trackInfo = playerEl?.innerText || 'no track';
        
        return 'uid=' + uid + ' track=' + trackInfo.substring(0,100);
    } catch(e) {
        return 'error: ' + e.message;
    }
})()`, returnByValue: true, awaitPromise: true });
console.log('API:', likeViaApi?.result?.result?.value || JSON.stringify(likeViaApi));

ws.close();
