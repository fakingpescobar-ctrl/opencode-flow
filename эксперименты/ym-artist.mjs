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
    
    // First open search and find Скриптонит
    console.log('Opening search...');
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
    
    // Click search input and type Скриптонит
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `document.querySelector('input[type=search]')?.click(); 'clicked'`,
        returnByValue: true
    });
    await sleep(300);
    
    // Clear and type
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await sleep(100);
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await sleep(200);
    
    for (const ch of 'Скриптонит') {
        await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch });
        await sleep(25);
    }
    await sleep(2000);
    
    // Find and click the artist link
    console.log('Clicking artist...');
    const click = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            // Find "Скриптонит" text in search results that is a link or clickable
            var all = document.querySelectorAll('a, span, div');
            for (var el of all) {
                if (el.innerText?.trim() === 'Скриптонит' && el.children.length === 0) {
                    // Find parent that is a link
                    var p = el;
                    while (p && p !== document.body) {
                        if (p.tagName === 'A') {
                            p.click();
                            return 'clicked link: ' + (p.href || '');
                        }
                        p = p.parentElement;
                    }
                    // Just click the element
                    el.click();
                    return 'clicked element';
                }
            }
            return 'not found';
        })()`,
        returnByValue: true
    });
    console.log('Click:', click?.result?.result?.value);
    await sleep(3000);
    
    // Now check what we see on artist page
    console.log('Checking artist page...');
    const state = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var r = [];
            r.push('Title: ' + document.title);
            r.push('URL: ' + window.location.href);
            var text = document.body.innerText;
            var lines = text.split('\\n').filter(function(l){return l.trim()});
            r.push('Total lines: ' + lines.length);
            r.push('---FIRST 40 LINES---');
            for (var i = 0; i < Math.min(40, lines.length); i++) r.push(lines[i]);
            return r.join('\\n');
        })()`,
        returnByValue: true
    });
    console.log(state?.result?.result?.value || '');
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
