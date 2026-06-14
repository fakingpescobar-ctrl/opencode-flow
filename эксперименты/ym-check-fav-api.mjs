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

// 1. Get liked tracks via API and check if 90921592 is there
const r1 = await send('Runtime.evaluate', {
    expression: `(async function(){
        try {
            var token = JSON.parse(localStorage.getItem('oauth')||'{}')?.value || '';
            var uid = JSON.parse(localStorage.getItem('ymUid')||'{}')?.value || '';
            var r = await fetch('https://api.music.yandex.net/users/' + uid + '/likes/tracks', {
                headers: {
                    'Authorization': 'OAuth ' + token,
                    'X-Yandex-Music-Client': 'YandexMusicAndroid/24023621'
                }
            });
            var d = await r.json();
            var lib = d?.result?.library;
            var count = lib?.count || 0;
            var ids = (lib?.tracks || []).map(function(t){ return t.id; });
            var has90921592 = ids.indexOf('90921592') >= 0;
            return 'count=' + count + ' has90921592=' + has90921592 + ' first5=' + ids.slice(0,5).join(',');
        } catch(e) {
            return 'ERR: ' + e.message;
        }
    })()`,
    returnByValue: true,
    awaitPromise: true
});
console.log('API check:', r1?.result?.result?.value);

ws.close();
