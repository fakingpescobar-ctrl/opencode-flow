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
    // Single track endpoint
    `fetch('https://api.music.yandex.net/users/'+uid+'/likes/tracks/90921592',{method:'POST'}).then(r=>r.text()).then(d=>'A:'+d.substring(0,300))`,
    // Query param
    `fetch('https://api.music.yandex.net/users/'+uid+'/likes/tracks/add-multiple?trackIds=90921592',{method:'POST'}).then(r=>r.text()).then(d=>'B:'+d.substring(0,300))`,
    // Form URL encoded
    `fetch('https://api.music.yandex.net/users/'+uid+'/likes/tracks/add-multiple',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'trackIds=90921592'}).then(r=>r.text()).then(d=>'C:'+d.substring(0,300))`,
    // No body but with Content-Type
    `fetch('https://api.music.yandex.net/users/'+uid+'/likes/tracks/add-multiple',{method:'POST',headers:{'Content-Type':'application/json;charset=utf-8'},body:'{"trackIds":[90921592]}'}).then(r=>r.text()).then(d=>'D:'+d.substring(0,300))`,
    // trackIds as string
    `fetch('https://api.music.yandex.net/users/'+uid+'/likes/tracks/add-multiple',{method:'POST',headers:{'Content-Type':'application/json;charset=utf-8'},body:'{"trackIds":"90921592"}'}).then(r=>r.text()).then(d=>'E:'+d.substring(0,300))`,
    // With album reference
    `fetch('https://api.music.yandex.net/users/'+uid+'/likes/tracks/add-multiple',{method:'POST',headers:{'Content-Type':'application/json;charset=utf-8'},body:'{"trackIds":[{"id":"90921592"}]}'}).then(r=>r.text()).then(d=>'F:'+d.substring(0,300))`,
];

for (var t of tests) {
    var r = await send('Runtime.evaluate', {
        expression: `(async function(){var uid=JSON.parse(localStorage.getItem('ymUid')||'{}')?.value;if(!uid)return 'no uid';try{return await ${t}}catch(e){return 'err:'+e.message}})()`,
        returnByValue: true,
        awaitPromise: true
    });
    console.log('>', r?.result?.result?.value);
}

ws.close();
