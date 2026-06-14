import http from 'node:http';
function getTargets() {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:9222/json`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}
function connectCDP(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.addEventListener('open', () => resolve(ws));
        ws.addEventListener('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
}
function sendCommand(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 100000);
        ws.send(JSON.stringify({ id, method, params }));
        const handler = (event) => {
            try {
                const resp = JSON.parse(event.data.toString());
                if (resp.id === id) {
                    ws.removeEventListener('message', handler);
                    resolve(resp);
                }
            } catch(e) {}
        };
        ws.addEventListener('message', handler);
        setTimeout(() => { ws.removeEventListener('message', handler); reject(new Error('Timeout')); }, 15000);
    });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    const targets = await getTargets();
    const page = targets.find(t => t.type === 'page' && t.url.includes('music-application'));
    const ws = await connectCDP(page.webSocketDebuggerUrl);
    console.log('Connected to:', page.title?.substring(0,60));
    
    // Try to click play on the track page
    const result = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            // Look for play button
            var btns = document.querySelectorAll('button');
            for (var btn of btns) {
                var txt = btn.innerText?.trim();
                if (txt === 'Слушать' || txt === 'Play' || txt === 'play' || txt === 'Слушать') {
                    btn.click(); return 'clicked: ' + txt;
                }
            }
            // Try [class*=play] buttons
            var playEls = document.querySelectorAll('[class*=play], [class*=Play]');
            for (var i = 0; i < Math.min(playEls.length, 10); i++) {
                var rect = playEls[i].getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && rect.top > 50 && rect.top < 600) {
                    playEls[i].click();
                    return 'clicked play element ' + i;
                }
            }
            // Try clicking body
            return 'no play button found. btns: ' + btns.length;
        })()`,
        returnByValue: true
    });
    console.log('Play result:', result?.result?.result?.value || '');
    
    await sleep(500);
    
    // Check if playing now via title
    const state = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var title = document.title;
            var nowPlaying = document.querySelector('.player-controls__track-name, [class*=nowPlaying], [class*=NowPlaying], [class*=player] [class*=title]');
            return 'Title: ' + title + ' | Player: ' + (nowPlaying?.innerText?.trim() || '?');
        })()`,
        returnByValue: true
    });
    console.log('State:', state?.result?.result?.value || '');
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
