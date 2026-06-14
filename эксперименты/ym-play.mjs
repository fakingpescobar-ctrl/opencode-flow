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
        setTimeout(() => { ws.removeEventListener('message', handler); reject(new Error('Timeout')); }, 10000);
    });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchAndPlay(ws, query) {
    // Step 1: Click "Поиск" in sidebar if not already on search page
    console.log('Opening search...');
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            let spans = document.querySelectorAll('span');
            for (let s of spans) {
                if (s.innerText?.trim() === 'Поиск') {
                    let el = s;
                    while (el && el !== document.body) {
                        let style = window.getComputedStyle(el);
                        if (style.cursor === 'pointer' || el.tagName === 'A' || el.tagName === 'BUTTON') {
                            el.click();
                            return 'clicked';
                        }
                        el = el.parentElement;
                    }
                }
            }
            return 'not found';
        })()`,
        returnByValue: true
    });
    await sleep(1500);
    
    // Step 2: Focus search input and type
    console.log('Typing query...');
    await sendCommand(ws, 'Input.dispatchKeyEvent', {
        type: 'char', text: query[0], unmodifiedText: query[0]
    });
    // Actually, let's use Input.insertText for the full text at once
    await sendCommand(ws, 'Input.insertText', { text: query });
    await sleep(1500);
    
    // Step 3: Wait for search results, then click first track
    console.log('Looking for results...');
    // Press Escape to close autocomplete if needed, then find and play
    await sendCommand(ws, 'Input.dispatchKeyEvent', {
        type: 'rawKeyDown', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter'
    });
    await sendCommand(ws, 'Input.dispatchKeyEvent', {
        type: 'keyUp', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter'
    });
    await sleep(2000);
    
    // Step 4: Try to find and click play on first track result
    console.log('Clicking play on result...');
    const result = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            // Try multiple selectors to find play button in search results
            var selectors = [
                '[data-test-id=play-button]',
                '[class*=play][class*=button]',
                'button[class*=play]',
                '[class*=PlayButton]',
                '[class*=playBtn]'
            ];
            for (var s of selectors) {
                var els = document.querySelectorAll(s);
                if (els.length > 0) {
                    els[0].click();
                    return 'Clicked: ' + s + ' (' + els.length + ' found)';
                }
            }
            // Look for any element with "play" in class that is visible
            var all = document.querySelectorAll('[class*="play" i]');
            for (var i = 0; i < Math.min(all.length, 20); i++) {
                var rect = all[i].getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && rect.top > 100) {
                    all[i].click();
                    return 'Clicked play element ' + i + ': ' + (all[i].className||'').substring(0,40);
                }
            }
            return 'No play button found';
        })()`,
        returnByValue: true
    });
    console.log('Result:', result?.result?.result?.value || 'no result');
}

async function main() {
    const query = process.argv.slice(2).join(' ') || 'Скриптонит Куда он валится';
    const targets = await getTargets();
    const page = targets.find(t => t.type === 'page' && t.url.includes('music-application'));
    const ws = await connectCDP(page.webSocketDebuggerUrl);
    console.log('Connected');
    
    await searchAndPlay(ws, query);
    
    console.log('Done');
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
