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
    
    // Focus search
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `document.querySelector('input[type=search]')?.click()`,
        returnByValue: true
    });
    await sleep(200);
    
    // Clear and type "Улица 36 Скриптонит"
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await sleep(100);
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await sleep(200);
    
    for (const ch of 'Улица 36 Скриптонит что ты знаешь об этом') {
        await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch });
        await sleep(15);
    }
    await sleep(3000);
    
    // Check results - look for the track in search
    const result = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            // Try to find "Что ты знаешь об этом" in results and click its play button
            var items = document.querySelectorAll('[class*=d-track], [class*=track], [class*=Track]');
            for (var item of items) {
                if (item.innerText?.includes('Что ты знаешь об этом')) {
                    // Find play button in this track item
                    var btn = item.querySelector('button');
                    if (btn) { btn.click(); return 'clicked track btn'; }
                    // Try data-test-id
                    var pb = item.querySelector('[data-test-id=play-button]');
                    if (pb) { pb.click(); return 'clicked play button'; }
                }
            }
            // Fallback: look for any element with matching text
            var all = document.querySelectorAll('*');
            for (var el of all) {
                if (el.children?.length === 0 && el.innerText?.trim()?.startsWith('Что ты знаешь об этом')) {
                    // Double click to play
                    el.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
                    return 'double-clicked';
                }
            }
            return 'not found in search';
        })()`,
        returnByValue: true
    });
    console.log('Result:', result?.result?.result?.value || '');
    
    await sleep(2000);
    
    const state = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `document.title`,
        returnByValue: true
    });
    console.log('Title:', state?.result?.result?.value);
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
