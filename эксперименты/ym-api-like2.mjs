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

// Get auth token and UID from localStorage
const authData = await send('Runtime.evaluate', { expression: `(function(){
    var ls = {};
    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        try { ls[key] = JSON.parse(localStorage.getItem(key)); } catch(e) { ls[key] = localStorage.getItem(key); }
    }
    return { oauth: ls.oauth?.value || '', uid: ls.ymUid?.value || '', deviceId: ls.ynisonDeviceId?.value || '' };
})()`, returnByValue: true });
const auth = authData?.result?.result?.value || {};
console.log('Auth obtained, uid:', auth.uid);

// Get current player state - find track ID from the DOM or window state
const trackInfo = await send('Runtime.evaluate', { expression: `(function(){
    var text = document.body.innerText;
    var lines = text.split('\\n').filter(l => l.trim());
    var pi = lines.indexOf('Плеер');
    if (pi >= 0) {
        return 'track=' + (lines[pi+1] || '') + ' artist=' + (lines[pi+2] || '');
    }
    return 'no player';
})()`, returnByValue: true });
console.log('Current:', trackInfo?.result?.result?.value);

ws.close();

// Now use the YM API with the token
const token = auth.oauth;
const uid = auth.uid;

if (!token || !uid) {
    console.log('No auth data found');
    process.exit(1);
}

// First search for the track to get its ID
const queryText = 'Maybe We Crazy 50 Cent';
const searchUrl = `https://api.music.yandex.net/search?text=${encodeURIComponent(queryText)}&type=track&page=0`;

console.log('Searching for track...');
const searchResult = await new Promise((resolve, reject) => {
    const options = {
        hostname: 'api.music.yandex.net',
        path: `/search?text=${encodeURIComponent(queryText)}&type=track&page=0`,
        headers: {
            'Authorization': `OAuth ${token}`,
            'X-Yandex-Music-Client': 'YandexMusicDesktop/5.106.2',
            'Accept': '*/*'
        }
    };
    http.get(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch(e) { resolve({error: e.message, raw: data.substring(0,200)}); }
        });
    }).on('error', reject);
});

console.log('Search result:', JSON.stringify(searchResult).substring(0, 500));
