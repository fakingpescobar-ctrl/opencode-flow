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

async function main() {
    const targets = await getTargets();
    const page = targets.find(t => t.type === 'page' && t.url.includes('music-application'));
    const ws = await connectCDP(page.webSocketDebuggerUrl);
    
    // Find inputs
    const inputs = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var inputs = document.querySelectorAll('input');
            var r = [];
            inputs.forEach(function(inp, i) {
                r.push(i + ': type=' + (inp.type||'') + ' placeholder="' + (inp.placeholder||'') + '" class="' + (inp.className||'').substring(0,40) + '" id="' + (inp.id||'') + '" value="' + (inp.value||'').substring(0,20) + '"');
            });
            return r.join('\\n') || 'no inputs';
        })()`,
        returnByValue: true
    });
    console.log('INPUTS:');
    console.log(inputs?.result?.result?.value || '');
    
    // Find elements with text "Поиск" (Search)
    const search = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var all = document.querySelectorAll('*');
            var r = [];
            for (var i = 0; i < all.length; i++) {
                var el = all[i];
                if (el.children.length === 0 && el.innerText && el.innerText.trim() === 'Поиск') {
                    r.push('TEXT: ' + el.tagName + ' class="' + (el.className||'').substring(0,50) + '" parent=' + (el.parentElement?.className||'').substring(0,30));
                    var p = el.parentElement;
                    if (p && p.tagName === 'BUTTON') r.push('  PARENT IS BUTTON! class="' + (p.className||'').substring(0,60) + '"');
                    if (p && p.tagName === 'A') r.push('  PARENT IS A! href="' + (p.href||'') + '"');
                }
            }
            return r.join('\\n') || 'not found';
        })()`,
        returnByValue: true
    });
    console.log('---SEARCH ELEMENTS---');
    console.log(search?.result?.result?.value || '');
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
