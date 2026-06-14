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

const tests = [
    { body: '{"track-ids":[90921592],"revision":1}', desc: 'track-ids array' },
    { body: '{"track-id":90921592}', desc: 'track-id singular' },
    { body: '{"track_id":90921592}', desc: 'track_id' },
    { body: '{"trackId":90921592}', desc: 'trackId singular' },
    { body: '{"ids":["90921592"]}', desc: 'ids array strings' },
    { body: '{"track-ids":["90921592"]}', desc: 'track-ids strings' },
];

for (var t of tests) {
    var r = await send('Runtime.evaluate', {
        expression: '(async function(){try{var uid=JSON.parse(localStorage.getItem(\'ymUid\')||\'{}\')?.value;var r=await fetch(\'https://api.music.yandex.net/users/\'+uid+\'/likes/tracks/add-multiple\',{method:\'POST\',headers:{\'Content-Type\':\'application/json;charset=utf-8\',\'X-Yandex-Music-Client\':\'YandexMusicDesktop/5.106.2\'},body:\'' + t.body + '\'});var d=await r.json();return \'' + t.desc + ': \' + JSON.stringify(d).substring(0,200)}catch(e){return \'' + t.desc + ':err:\'+e.message}})()',
        returnByValue: true,
        awaitPromise: true
    });
    console.log('>', r?.result?.result?.value);
}

ws.close();
