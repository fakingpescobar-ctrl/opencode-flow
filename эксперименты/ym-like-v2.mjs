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

// Get current track name and search + like via API
const likeResult = await send('Runtime.evaluate', { 
    expression: `(async function(){
        try {
            var uid = JSON.parse(localStorage.getItem('ymUid') || '{}')?.value || '';
            if (!uid) return 'No UID';
            
            // Get current track from player
            var lines = document.body.innerText.split('\\n').filter(function(l){return l.trim()});
            var pi = lines.indexOf('Плеер');
            var trackName = pi >= 0 ? lines[pi+1] : '';
            var artistName = pi >= 0 ? lines[pi+2] : '';

            // Search for the track
            var searchResp = await fetch('https://api.music.yandex.net/search?text=' + encodeURIComponent(trackName + ' ' + artistName) + '&type=track&page=0', {
                headers: {'X-Yandex-Music-Client': 'YandexMusicDesktop/5.106.2'}
            });
            var searchData = await searchResp.json();
            var tracks = searchData?.result?.tracks?.results || [];
            
            if (tracks.length === 0) return 'No track found';
            
            var trackId = tracks[0].id;
            var trackTitle = tracks[0].title;
            
            // Like track via API
            var likeResp = await fetch('https://api.music.yandex.net/users/' + uid + '/likes/tracks/add-multiple', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=utf-8',
                    'X-Yandex-Music-Client': 'YandexMusicDesktop/5.106.2'
                },
                body: JSON.stringify({trackIds: [trackId], revision: 1})
            });
            var likeData = await likeResp.json();
            
            return 'Liked: ' + trackTitle + ' (id=' + trackId + ') status=' + (likeData.error ? 'error:' + likeData.error : 'success') + ' result=' + JSON.stringify(likeData).substring(0,200);
        } catch(e) {
            return 'Error: ' + e.message + ' stack: ' + (e.stack||'').substring(0,200);
        }
    })()`, 
    returnByValue: true, 
    awaitPromise: true 
});

console.log('Like result:', likeResult?.result?.result?.value || JSON.stringify(likeResult));

// Wait then check collection count
await new Promise(r => setTimeout(r, 2000));

// Go to collection
await send('Runtime.evaluate', { expression: `(function(){
    for (let s of document.querySelectorAll('span'))
        if (s.innerText?.trim() === 'Коллекция') {
            let el = s; while (el && el !== document.body) {
                if (window.getComputedStyle(el).cursor === 'pointer') { el.click(); return 'ok'; }
                el = el.parentElement;
            }
        }
    return 'not found';
})()`, returnByValue: true });
await new Promise(r => setTimeout(r, 2000));

const countCheck = await send('Runtime.evaluate', { expression: `(function(){
    var text = document.body.innerText;
    var lines = text.split('\\n').filter(l => l.trim());
    var idx = lines.indexOf('Мне нравится');
    if (idx >= 0) {
        var tracks = lines.slice(idx, idx+15);
        return tracks.join('\\n');
    }
    return 'not found';
})()`, returnByValue: true });
console.log('\\nLiked tracks:');
console.log(countCheck?.result?.result?.value || '');

ws.close();
