import http from 'node:http';
const data = await new Promise(r => http.get('http://localhost:9222/json', res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); }));
const page = data.find(t => t.type === 'page' && t.url.includes('music-application'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 1;
function send(m, p) {
    return new Promise((res, rej) => {
        let mid = id++; ws.send(JSON.stringify({id:mid, method:m, params:p}));
        let h = e => { try { let r = JSON.parse(e.data); if (r.id === mid) { ws.removeEventListener('message', h); res(r); } } catch{} };
        ws.addEventListener('message', h);
        setTimeout(() => { ws.removeEventListener('message', h); res({}); }, 15000);
    });
}

// Try different API formats
const uid = await send('Runtime.evaluate', { expression: 'JSON.parse(localStorage.getItem("ymUid")||"{}")?.value || ""', returnByValue: true });
const uidVal = uid?.result?.result?.value || '';
console.log('UID:', uidVal);

const trackId = '90921592';

// Try each endpoint format
const endpoints = [
    { url: 'https://api.music.yandex.net/users/' + uidVal + '/likes/tracks', method: 'POST', body: JSON.stringify({'track-id': parseInt(trackId)}) },
    { url: 'https://api.music.yandex.net/users/' + uidVal + '/likes/tracks/add-multiple', method: 'POST', body: JSON.stringify({'track-ids': [trackId]}) },
    { url: 'https://api.music.yandex.net/users/' + uidVal + '/likes/tracks/' + trackId, method: 'POST', body: '' },
];

for (var ep of endpoints) {
    var r = await send('Runtime.evaluate', { 
        expression: '(async function(url, method, body) { try { var r = await fetch(url, { method: method, headers: {"Content-Type":"application/json;charset=utf-8","X-Yandex-Music-Client":"YandexMusicDesktop/5.106.2"}, body: body || undefined }); var d = await r.json(); return url.substring(0,80) + " => " + (d.error ? "err:" + d.error.name + "/" + d.error.message : "ok:" + JSON.stringify(d).substring(0,100)); } catch(e) { return url.substring(0,80) + " => fetch err:" + e.message; } })(\'' + ep.url + '\', \'' + ep.method + '\', \'' + (ep.body || '') + '\')', 
        returnByValue: true, 
        awaitPromise: true 
    });
    console.log('EP:', r?.result?.result?.value || JSON.stringify(r));
    await new Promise(r => setTimeout(r, 500));
}

ws.close();
