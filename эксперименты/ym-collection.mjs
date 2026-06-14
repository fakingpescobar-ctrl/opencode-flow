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

    // Click Коллекция in sidebar
    console.log('Opening Коллекция...');
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            for (let s of document.querySelectorAll('span'))
                if (s.innerText?.trim() === 'Коллекция') {
                    let el = s;
                    while (el && el !== document.body) {
                        if (el.tagName === 'A' || el.tagName === 'BUTTON' || window.getComputedStyle(el).cursor === 'pointer') {
                            el.click(); return 'clicked';
                        }
                        el = el.parentElement;
                    }
                    s.click(); return 'clicked span';
                }
            return 'not found';
        })()`,
        returnByValue: true
    });
    await sleep(3000);
    
    // Get page content
    const state = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var r = [];
            r.push('Title: ' + document.title);
            r.push('URL: ' + window.location.href);
            var text = document.body.innerText;
            var lines = text.split('\\n').filter(function(l){return l.trim()});
            r.push('Total lines: ' + lines.length);
            r.push('---ALL LINES---');
            for (var i = 0; i < lines.length; i++) r.push(lines[i]);
            return r.join('\\n');
        })()`,
        returnByValue: true
    });
    console.log(state?.result?.result?.value || JSON.stringify(state));
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
