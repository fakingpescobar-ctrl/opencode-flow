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
        setTimeout(() => { ws.removeEventListener('message', h); res({}); }, 30000);
    });
}

// Call the YM API from within the page context using fetch (has proper auth cookies)
const likeResult = await send('Runtime.evaluate', { expression: `(async function(){
    try {
        // First get the current track info from the queue
        var playerInfo = document.querySelector('[class*=player]');
        var text = document.body.innerText;
        var lines = text.split('\\n').filter(function(l){return l.trim()});
        var pi = lines.indexOf('Плеер');
        var trackName = pi >= 0 ? lines[pi+1] : '';
        var artistName = pi >= 0 ? lines[pi+2] : '';
        
        // Search for the track via YM API
        var searchResp = await fetch('https://api.music.yandex.net/search?text=' + encodeURIComponent(trackName + ' ' + artistName) + '&type=track&page=0', {
            headers: {'X-Yandex-Music-Client': 'YandexMusicDesktop/5.106.2'}
        });
        var searchData = await searchResp.json();
        var tracks = searchData?.result?.tracks?.results || [];
        
        if (tracks.length === 0) {
            return 'No tracks found in search';
        }
        
        var trackId = tracks[0].id;
        var trackTitle = tracks[0].title;
        
        // Get UID from localStorage
        var uid = JSON.parse(localStorage.getItem('ymUid') || '{}')?.value || '';
        if (!uid) return 'No UID';
        
        // Like the track via API
        var likeResp = await fetch('https://api.music.yandex.net/users/' + uid + '/likes/tracks/add-multiple', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
                'X-Yandex-Music-Client': 'YandexMusicDesktop/5.106.2'
            },
            body: JSON.stringify({trackIds: [trackId]})
        });
        var likeData = await likeResp.json();
        
        // Also try the simple like endpoint
        var likeResp2 = await fetch('https://api.music.yandex.net/users/' + uid + '/likes/tracks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
                'X-Yandex-Music-Client': 'YandexMusicDesktop/5.106.2'
            },
            body: JSON.stringify({trackId: trackId})
        });
        var likeData2 = await likeResp2.json();
        
        return 'Liked track: ' + trackTitle + ' (id=' + trackId + ') result1=' + JSON.stringify(likeData).substring(0,100) + ' result2=' + JSON.stringify(likeData2).substring(0,100);
    } catch(e) {
        return 'Error: ' + e.message;
    }
})()`, returnByValue: true, awaitPromise: true });
console.log('Result:', likeResult?.result?.result?.value || JSON.stringify(likeResult));

ws.close();
