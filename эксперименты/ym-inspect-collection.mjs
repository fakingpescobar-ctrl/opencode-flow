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
    
    // Find track in DOM and dump its HTML structure
    const info = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var r = [];
            var all = document.querySelectorAll('*');
            for (var el of all) {
                if (el.children?.length === 0 && el.innerText?.trim()?.includes('Что ты знаешь об этом')) {
                    r.push('TRACK TEXT FOUND:');
                    r.push('  tag=' + el.tagName + ' class="' + (el.className||'').substring(0,50) + '"');
                    
                    // Walk up to find track container
                    var p = el.parentElement;
                    var depth = 0;
                    while (p && p !== document.body && depth < 10) {
                        r.push('  parent[' + depth + ']: tag=' + p.tagName + ' class="' + (p.className||'').substring(0,60) + '" id="' + (p.id||'') + '"');
                        // Check for play buttons in this parent
                        var btns = p.querySelectorAll('button');
                        if (btns.length > 0) {
                            r.push('  buttons in parent[' + depth + ']: ' + btns.length);
                            for (var b = 0; b < btns.length; b++) {
                                r.push('    btn[' + b + ']: class="' + (btns[b].className||'').substring(0,40) + '" inner="' + (btns[b].innerText||'').trim().substring(0,20) + '"');
                            }
                        }
                        // Check for [class*=play] in this parent
                        var playEls = p.querySelectorAll('[class*=play]');
                        if (playEls.length > 0) {
                            r.push('  play elements in parent[' + depth + ']: ' + playEls.length);
                            for (var pe = 0; pe < Math.min(playEls.length, 5); pe++) {
                                r.push('    play[' + pe + ']: tag=' + playEls[pe].tagName + ' class="' + (playEls[pe].className||'').substring(0,40) + '" rect=' + (playEls[pe].getBoundingClientRect().top|0));
                            }
                        }
                        p = p.parentElement;
                        depth++;
                    }
                    break;
                }
            }
            return r.join('\\n') || 'not found';
        })()`,
        returnByValue: true
    });
    console.log(info?.result?.result?.value || '');
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
