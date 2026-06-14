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

async function main() {
    const targets = await getTargets();
    const page = targets.find(t => t.type === 'page' && t.url.includes('music-application'));
    const ws = await connectCDP(page.webSocketDebuggerUrl);
    
    // Click on "Поиск" by finding the parent that's clickable
    const clickResult = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            // Find span with text "Поиск"
            var spans = document.querySelectorAll('span');
            for (var i = 0; i < spans.length; i++) {
                if (spans[i].innerText?.trim() === 'Поиск') {
                    var el = spans[i];
                    // Go up until we find a clickable element
                    var parent = el;
                    while (parent && parent !== document.body) {
                        if (parent.tagName === 'A' || parent.tagName === 'BUTTON' || parent.onclick || parent.getAttribute('role') === 'button') {
                            parent.click();
                            return 'Clicked parent: ' + parent.tagName + ' class=' + (parent.className||'');
                        }
                        var style = window.getComputedStyle(parent);
                        if (style.cursor === 'pointer') {
                            parent.click();
                            return 'Clicked pointer: ' + parent.tagName + ' class=' + (parent.className||'');
                        }
                        parent = parent.parentElement;
                    }
                    // Just click the span itself
                    spans[i].click();
                    return 'Clicked span directly';
                }
            }
            return 'Not found';
        })()`,
        returnByValue: true
    });
    console.log('Click: ' + (clickResult?.result?.result?.value || JSON.stringify(clickResult)));
    
    await sleep(2000);
    
    // Now check what's on the page - look for search input
    const check = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var r = [];
            // Check inputs
            var inputs = document.querySelectorAll('input');
            r.push('Inputs: ' + inputs.length);
            inputs.forEach(function(inp, i) {
                r.push('  ' + i + ': type=' + (inp.type||'') + ' pl="' + (inp.placeholder||'') + '" class="' + (inp.className||'').substring(0,40) + '"');
            });
            // Check for contenteditable
            var edit = document.querySelectorAll('[contenteditable]');
            r.push('ContentEditable: ' + edit.length);
            edit.forEach(function(el, i) {
                r.push('  ' + i + ': tag=' + el.tagName + ' class="' + (el.className||'').substring(0,40) + '"');
            });
            // Check for any input-like elements
            var all = document.querySelectorAll('[role=searchbox], [role=search], [data-test=search]');
            r.push('Search roles: ' + all.length);
            // Check textarea
            var ta = document.querySelectorAll('textarea');
            r.push('Textareas: ' + ta.length);
            // Title
            r.push('Title: ' + document.title);
            // Body first 300 chars of text
            r.push('---BODY---');
            r.push((document.body?.innerText || '').substring(0, 500));
            return r.join('\\n');
        })()`,
        returnByValue: true
    });
    console.log('---AFTER CLICK---');
    console.log(check?.result?.result?.value || '');
    
    ws.close();
}
main().catch(e => console.error('Error:', e.message));
