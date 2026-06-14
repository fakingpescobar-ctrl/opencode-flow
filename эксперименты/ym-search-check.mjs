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
                            el.click(); return 'clicked';
                        }
                        el = el.parentElement;
                    }
                }
            return 'not found';
        })()`,
        returnByValue: true
    });
    await sleep(2000);
    
    // Focus search input and type query
    console.log('Focusing search input...');
    // First click on the search input to focus it
    await sendCommand(ws, 'Runtime.evaluate', {
        expression: `document.querySelector('input[type=search]')?.focus(); 'focused'`,
        returnByValue: true
    });
    await sleep(300);
    
    // Clear and type using insertText
    console.log('Typing query...');
    await sendCommand(ws, 'Input.insertText', { text: query });
    await sleep(2000);
    
    // Check if search results appeared
    console.log('Checking page state...');
    const state = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var r = [];
            r.push('Title: ' + document.title.substring(0,100));
            // Check for track results - look for elements with track info
            var text = document.body.innerText;
            var idx = text.indexOf('Куда');
            r.push('Found Куда in text: ' + (idx > -1 ? 'yes at ' + idx : 'no'));
            // Check inputs
            var inp = document.querySelector('input[type=search]');
            r.push('Search value: "' + (inp?.value||'') + '"');
            // Check if search results container exists
            var results = document.querySelectorAll('[class*=searchResults], [class*=SearchResults], [class*=search-results], [class*=suggest], [class*=Suggest]');
            r.push('Search results containers: ' + results.length);
            // Quick body text sample
            r.push('---TEXT---');
            r.push(text.substring(0, 800));
            return r.join('\\n');
        })()`,
        returnByValue: true
    });
    console.log(state?.result?.result?.value || '');
    
    ws.close();
    console.log('Done');
}
main().catch(e => console.error('Error:', e.message));
