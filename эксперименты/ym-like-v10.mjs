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

// Try web API feedback endpoint + also check the exact endpoint YM desktop uses
const r = await send('Runtime.evaluate', {
    expression: `(async function(){
        var out = [];
        // 1. Try feedback/like endpoint (web API)
        try {
            var r1 = await fetch('https://music.yandex.ru/api/v2.1/handlers/feedback', {
                method: 'POST',
                headers: {'Content-Type':'application/json;charset=utf-8'},
                body: JSON.stringify({feedback: {track: {id: '90921592'}}, type: 'like'})
            });
            var d1 = await r1.text();
            out.push('feedback:' + d1.substring(0,200));
        } catch(e) { out.push('feedback-err:'+e.message); }

        // 2. Check if track is already liked
        try {
            var r2 = await fetch('https://api.music.yandex.net/tracks/90921592');
            var d2 = await r2.json();
            out.push('track:' + JSON.stringify(d2.result?.[0]?.likesCount || 'no likes'));
        } catch(e) { out.push('track-err:'+e.message); }

        return out.join(' | ');
    })()`,
    returnByValue: true,
    awaitPromise: true
});
console.log(r?.result?.result?.value);
ws.close();
