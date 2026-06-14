import http from 'node:http';

const CDP_PORT = 9222;

function getTargets() {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${CDP_PORT}/json`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        const msg = JSON.stringify({ id, method, params });
        ws.send(msg);
        
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
        
        setTimeout(() => {
            ws.removeEventListener('message', handler);
            reject(new Error('Timeout'));
        }, 10000);
    });
}

async function main() {
    const action = process.argv[2] || 'search';
    const query = process.argv.slice(3).join(' ') || 'Скриптонит Куда он валится';
    
    const targets = await getTargets();
    const page = targets.find(t => t.type === 'page' && t.url.includes('music-application'));
    if (!page) {
        console.error('YM page not found');
        process.exit(1);
    }
    
    console.log('Target:', page.title?.substring(0, 60));
    const ws = await connectCDP(page.webSocketDebuggerUrl);
    console.log('Connected to CDP');
    
    if (action === 'search') {
        // Focus search with /
        console.log('Sending / to focus search...');
        await sendCommand(ws, 'Input.dispatchKeyEvent', {
            type: 'char', text: '/', unmodifiedText: '/'
        });
        await sleep(400);
        
        // Type query
        console.log('Typing:', query);
        for (const ch of query) {
            await sendCommand(ws, 'Input.dispatchKeyEvent', {
                type: 'char', text: ch, unmodifiedText: ch
            });
            await sleep(20);
        }
        await sleep(500);
        
        // Press Enter
        console.log('Pressing Enter...');
        await sendCommand(ws, 'Input.dispatchKeyEvent', {
            type: 'rawKeyDown', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter'
        });
        await sendCommand(ws, 'Input.dispatchKeyEvent', {
            type: 'keyUp', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter'
        });
        
        await sleep(3000);
        
        // Click play on first result
        console.log('Clicking play...');
        try {
            const result = await sendCommand(ws, 'Runtime.evaluate', {
                expression: `document.querySelector('[data-test-id=play-button]')?.click() || 
                    document.querySelector('.d-track__play-btn')?.click() || 'not found'`,
                returnByValue: true
            });
            console.log('Result:', JSON.stringify(result?.result?.result?.value || result));
        } catch (e) {
            console.log('Eval click failed:', e.message);
        }
    } 
    else if (action === 'current') {
        try {
            const t = await sendCommand(ws, 'Runtime.evaluate', {
                expression: `(function(){ 
                    var title = document.querySelector('.player-controls__track-name, .track__title, .d-track__name');
                    var artist = document.querySelector('.player-controls__artist-name, .track__artists, .d-track__artists');
                    return (artist?.innerText||'?') + ' - ' + (title?.innerText||'?') + ' | ' + document.title;
                })()`,
                returnByValue: true
            });
            const val = t?.result?.result?.value || 'no response';
            console.log('Now playing:', val);
        } catch(e) {
            console.log('Error:', e.message);
        }
    }
    
    ws.close();
    console.log('Done');
}

main().catch(e => console.error('Fatal:', e.message));
