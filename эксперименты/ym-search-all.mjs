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
    
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            for (let s of document.querySelectorAll('span'))
                if (s.innerText?.trim() === 'Поиск') {
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
    await sleep(1500);
    
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `document.querySelector('input[type=search]')?.click()`,
        returnByValue: true
    });
    await sleep(200);
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await sleep(100);
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await sleep(200);
    
    for (const ch of 'Куда он валится') {
        await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch });
        await sleep(20);
    }
    await sleep(2500);
    
    // Get the ENTIRE body text to look for anything track-related
    const state = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var text = document.body.innerText;
            // Find the relevant section - everything after "Треки" or "Исполнители"
            var idx = text.indexOf('Треки');
            var relevant = idx >= 0 ? text.substring(idx) : text;
            return relevant.substring(0, 3000);
        })()`,
        returnByValue: true
    });
    console.log('=== SEARCH RESULTS ===');
    console.log(state?.result?.result?.value || '');
    
    // Also try clicking first track if any exist  
    const tracks = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            // Check for "Треки" section and see if there are tracks
            var sections = document.querySelectorAll('[class*=section], [class*=Section], section');
            var r = [];
            for (var s of sections) {
                var h = s.querySelector('h2, h3, h4');
                if (h && h.innerText === 'Треки') {
                    r.push('Found Треки section');
                    var items = s.querySelectorAll('[class*=track], [class*=item], li');
                    r.push('Items: ' + items.length);
                    // Get text of first few items
                    for (var i = 0; i < Math.min(5, items.length); i++) {
                        r.push('  ' + i + ': ' + (items[i].innerText||'').trim().substring(0,80));
                    }
                }
            }
            return r.join('\\n') || 'no sections found';
        })()`,
        returnByValue: true
    });
    console.log('=== SECTION ===');
    console.log(tracks?.result?.result?.value || '');
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
