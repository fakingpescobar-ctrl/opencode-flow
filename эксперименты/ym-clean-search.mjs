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
    const query = process.argv.slice(2).join(' ') || 'Скриптонит Куда он валится';
    const targets = await getTargets();
    const page = targets.find(t => t.type === 'page' && t.url.includes('music-application'));
    const ws = await connectCDP(page.webSocketDebuggerUrl);
    console.log('Connected');
    
    // Click Поиск in sidebar
    console.log('Opening search...');
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            for (let s of document.querySelectorAll('span'))
                if (s.innerText?.trim() === 'Поиск') {
                    let el = s;
                    while (el && el !== document.body) {
                        if (el.tagName === 'A' || el.tagName === 'BUTTON' || window.getComputedStyle(el).cursor === 'pointer') {
                            el.click(); return 'search opened';
                        }
                        el = el.parentElement;
                    }
                }
            return 'not found';
        })()`,
        returnByValue: true
    });
    await sleep(2000);
    
    // Click on search input to focus it via mouse
    console.log('Clicking search input...');
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var inp = document.querySelector('input[type=search]');
            if (!inp) return 'no input';
            var rect = inp.getBoundingClientRect();
            // Dispatch click on the input
            inp.dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: rect.left+10, clientY: rect.top+10}));
            inp.focus();
            return 'clicked input';
        })()`,
        returnByValue: true
    });
    await sleep(500);
    
    // Select all (Ctrl+A) then Delete
    console.log('Clearing input...');
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await sleep(100);
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await sleep(200);
    
    // Type each character individually
    console.log('Typing:', query);
    for (const ch of query) {
        await sendCommand(ws, 'Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch });
        await sleep(30);
    }
    await sleep(3000);
    
    // Check what's on the page  
    console.log('Checking results...');
    const state = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var r = [];
            var inp = document.querySelector('input[type=search]');
            r.push('Search value: "' + (inp?.value||'') + '"');
            var text = document.body.innerText;
            // Check different sections
            var sections = text.split('\\n').filter(function(l){return l.trim().length > 0});
            r.push('Lines: ' + sections.length);
            r.push('---FIRST 20 LINES---');
            for (var i = 0; i < Math.min(20, sections.length); i++) r.push(sections[i]);
            return r.join('\\n');
        })()`,
        returnByValue: true
    });
    console.log(state?.result?.result?.value || '');
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
