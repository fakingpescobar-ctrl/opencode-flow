import http from 'node:http';
const data = await new Promise(r => http.get('http://localhost:9222/json', res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); }));
const page = data.find(t => t.type === 'page' && t.url.includes('music-application'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 1;
function send(m, p) {
    return new Promise((res) => {
        let mid = id++; ws.send(JSON.stringify({id:mid, method:m, params:p}));
        let h = e => { try { let r = JSON.parse(e.data); if (r.id === mid) { ws.removeEventListener('message', h); res(r); } } catch{} };
        ws.addEventListener('message', h);
        setTimeout(() => { ws.removeEventListener('message', h); res({}); }, 15000);
    });
}

const r = await send('Runtime.evaluate', {
    expression: `(async function(){
        try {
            // Get token & uid from localStorage
            var token = JSON.parse(localStorage.getItem('oauth') || '{}')?.value || '';
            var uid = JSON.parse(localStorage.getItem('ymUid') || '{}')?.value || '';
            if (!token || !uid) return 'no token/uid';

            // Send exactly as the Android library does: form-encoded with track-ids
            var r = await fetch('https://api.music.yandex.net/users/' + uid + '/likes/tracks/add-multiple', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Yandex-Music-Client': 'YandexMusicAndroid/24023621',
                    'Authorization': 'OAuth ' + token
                },
                body: 'track-ids=90921592'
            });
            var d = await r.text();
            return 'Form-like: ' + d.substring(0, 300);
        } catch(e) {
            return 'ERR: ' + e.message;
        }
    })()`,
    returnByValue: true,
    awaitPromise: true
});
console.log('Result:', r?.result?.result?.value);
ws.close();
