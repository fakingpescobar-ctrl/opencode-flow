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
    console.log('Connected');
    
    // Go to artist page using known URL
    await sendCommand(ws, 'Page.navigate', { url: 'music-application://desktop/artist?artistId=3246342' });
    await sleep(3000);
    
    // Check page content
    const text = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var t = document.body.innerText;
            var lines = t.split('\\n').filter(function(l){return l.trim()});
            return lines.join('\\n');
        })()`,
        returnByValue: true
    });
    const content = text?.result?.result?.value || '';
    console.log('Artist page:');
    console.log(content.substring(0, 1500));
    
    // Look for "Улица 36" in the page
    var hasAlbum = content.includes('Улица 36');
    console.log('\nHas Улица 36:', hasAlbum);
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
