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
    
    // Go to collection
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            for (let s of document.querySelectorAll('span'))
                if (s.innerText?.trim() === 'Коллекция') {
                    let el = s;
                    while (el && el !== document.body) {
                        if (el.tagName === 'A' || el.tagName === 'BUTTON' || window.getComputedStyle(el).cursor === 'pointer') {
                            el.click(); return 'opened';
                        }
                        el = el.parentElement;
                    }
                }
            return 'not found';
        })()`,
        returnByValue: true
    });
    await sleep(2000);
    
    // Find the track "Что ты знаешь об этом" and click its play button
    const result = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            // Look for the track in the tracks list
            var all = document.querySelectorAll('*');
            for (var el of all) {
                if (el.children.length === 0 && el.innerText?.trim().includes('Что ты знаешь об этом')) {
                    // Found the track text - go up to find the track row/container
                    var row = el;
                    while (row && row !== document.body) {
                        // Look for a play button inside this row
                        var playBtn = row.querySelector('[class*=play]');
                        if (playBtn && playBtn !== row) {
                            // Check if it's a button or clickable
                            if (playBtn.tagName === 'BUTTON' || playBtn.tagName === 'A' || window.getComputedStyle(playBtn).cursor === 'pointer') {
                                playBtn.click();
                                return 'clicked play button in row';
                            }
                            // Try parent
                            var pp = playBtn.parentElement;
                            if (pp.tagName === 'BUTTON' || pp.tagName === 'A') {
                                pp.click();
                                return 'clicked play button parent';
                            }
                            // Just click the play element
                            playBtn.click();
                            return 'clicked play element directly';
                        }
                        // If row itself has a play button, we found it
                        if (row.className?.includes('track') || row.className?.includes('Track') || row.tagName === 'TR') {
                            break;
                        }
                        row = row.parentElement;
                    }
                    // Fallback: double-click the track text to play
                    el.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
                    return 'double-clicked track';
                }
            }
            return 'track not found';
        })()`,
        returnByValue: true
    });
    console.log('Result:', result?.result?.result?.value || '');
    
    await sleep(1000);
    
    const state = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `document.title`,
        returnByValue: true
    });
    console.log('Title:', state?.result?.result?.value);
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
