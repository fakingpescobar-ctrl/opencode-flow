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
    
    // Open search
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            for (let s of document.querySelectorAll('span'))
                if (s.innerText?.trim() === 'Поиск') {
                    let el = s;
                    while (el && el !== document.body) {
                        if (window.getComputedStyle(el).cursor === 'pointer') { el.click(); return 'ok'; }
                        el = el.parentElement;
                    }
                }
            return 'not found';
        })()`,
        returnByValue: true
    });
    await sleep(1500);
    
    // Focus search input
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `document.querySelector('input[type=search]')?.click()`,
        returnByValue: true
    });
    await sleep(200);
    
    // Clear and type
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await sleep(100);
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await sleep(200);
    
    for (const ch of 'Что ты знаешь об этом') {
        await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch });
        await sleep(15);
    }
    await sleep(2500);
    
    // Find the track row and click its play button
    console.log('Clicking track play...');
    const result = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            // Find all visible play buttons in the search results area
            var btns = document.querySelectorAll('button');
            for (var btn of btns) {
                var rect = btn.getBoundingClientRect();
                // Only buttons in the upper area of the page (results, not player bar)
                if (rect.top > 0 && rect.top < 500 && rect.width > 0) {
                    // Check if this button is near track text
                    var parent = btn.parentElement;
                    var parentText = parent?.innerText || '';
                    if (parentText.includes('Что ты знаешь об этом')) {
                        btn.click();
                        return 'clicked play near track text';
                    }
                    // Check siblings
                    var siblings = parent?.querySelectorAll('*');
                    for (var sib of siblings || []) {
                        if (sib.innerText?.includes('Что ты знаешь об этом')) {
                            btn.click();
                            return 'clicked play button sibling';
                        }
                    }
                }
            }
            
            // Fallback: find element with exact text and click its parent container
            var all = document.querySelectorAll('*');
            for (var el of all) {
                if (el.children?.length === 0 && el.innerText?.trim()?.startsWith('Что ты знаешь об этом')) {
                    // Find parent that contains both track name and a play button
                    var p = el.parentElement;
                    while (p && p !== document.body) {
                        var playBtn = p.querySelector('button');
                        if (playBtn) {
                            playBtn.click();
                            return 'clicked button in parent container';
                        }
                        p = p.parentElement;
                    }
                }
            }
            return 'not found';
        })()`,
        returnByValue: true
    });
    console.log('Result:', result?.result?.result?.value || '');
    
    await sleep(1500);
    
    const state = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var lines = document.body.innerText.split('\\n').filter(function(l){return l.trim()});
            var playerIdx = lines.indexOf('Плеер');
            var playerInfo = playerIdx >= 0 ? lines.slice(playerIdx, playerIdx+4).join(' | ') : 'no player section';
            return 'Title: ' + document.title + ' | Player: ' + playerInfo;
        })()`,
        returnByValue: true
    });
    console.log('State:', state?.result?.result?.value || '');
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
