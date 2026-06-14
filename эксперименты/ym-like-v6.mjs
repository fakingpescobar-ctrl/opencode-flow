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

// Try multiple formats
const tests = [
    `fetch('https://api.music.yandex.net/users/'+uid+'/likes/tracks/add-multiple',{method:'POST',headers:{'Content-Type':'application/json','X-Yandex-Music-Client':'YandexMusicDesktop/5.106.2'},body:'{"trackIds":[90921592]}'}).then(r=>r.json()).then(d=>'A:'+JSON.stringify(d).substring(0,200))`,
    `fetch('https://api.music.yandex.net/users/'+uid+'/likes/tracks/add-multiple',{method:'POST',headers:{'Content-Type':'application/json','X-Yandex-Music-Client':'YandexMusicDesktop/5.106.2'},body:'{"track-ids":[90921592]}'}).then(r=>r.json()).then(d=>'B:'+JSON.stringify(d).substring(0,200))`,
    `fetch('https://api.music.yandex.net/users/'+uid+'/likes/tracks/add-multiple',{method:'POST',headers:{'Content-Type':'application/json','X-Yandex-Music-Client':'YandexMusicDesktop/5.106.2'},body:'{"ids":[90921592]}'}).then(r=>r.json()).then(d=>'C:'+JSON.stringify(d).substring(0,200))`,
];

for (var test of tests) {
    var r = await send('Runtime.evaluate', {
        expression: `(async function(){var uid=JSON.parse(localStorage.getItem('ymUid')||'{}')?.value;try{return await ${test}}catch(e){return 'err:'+e.message}})()`,
        returnByValue: true,
        awaitPromise: true
    });
    console.log('Test:', r?.result?.result?.value);
}

ws.close();
