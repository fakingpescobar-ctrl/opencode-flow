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
    
    // Get info about the page
    const info = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var r = [];
            // Current URL
            r.push('URL: ' + window.location.href);
            // Document title  
            r.push('Title: ' + document.title);
            // Body classes
            r.push('Body classes: ' + (document.body?.className || 'none'));
            // Look for buttons
            var btns = document.querySelectorAll('button');
            r.push('Button count: ' + btns.length);
            // Look for inputs
            var inputs = document.querySelectorAll('input');
            r.push('Input count: ' + inputs.length);
            // Look for key elements
            ['search', 'play', 'track', 'player', 'header', 'nav'].forEach(function(cls) {
                var els = document.querySelectorAll('[class*="' + cls + '"], [class*="' + cls.charAt(0).toUpperCase() + cls.slice(1) + '"]');
                r.push(cls + ' elements: ' + els.length);
            });
            // Check for shadow DOM
            r.push('Body children: ' + (document.body?.children?.length || 0));
            // Main app container
            var root = document.getElementById('root') || document.querySelector('[data-root]') || document.querySelector('#app');
            r.push('Root: ' + (root?.tagName || 'not found'));
            return r.join('\\n');
        })()`,
        returnByValue: true
    });
    console.log(info?.result?.result?.value || JSON.stringify(info));
    
    // Also dump innerText
    const text = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `document.body?.innerText?.substring(0, 1500) || 'no body'`,
        returnByValue: true
    });
    console.log('---BODY TEXT---');
    console.log(text?.result?.result?.value || '');
    
    // Get outer HTML structure
    const html = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(function(){
            function structure(el, depth) {
                if (depth > 4 || !el || el.tagName === undefined) return '';
                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return '';
                var s = '  '.repeat(depth) + '<' + el.tagName?.toLowerCase();
                if (el.id) s += ' id=' + el.id;
                if (el.className && typeof el.className === 'string') s += ' class="' + el.className.substring(0, 60) + '"';
                s += '>\\n';
                // Only show first 5 children
                var kids = Array.from(el.children);
                var toShow = kids.slice(0, 8);
                toShow.forEach(function(c) { s += structure(c, depth + 1); });
                if (kids.length > 8) s += '  '.repeat(depth+1) + '...(' + kids.length + ' children)\\n';
                return s;
            }
            return structure(document.body, 0);
        })()`,
        returnByValue: true
    });
    console.log('---STRUCTURE---');
    console.log(html?.result?.result?.value || '');
    
    ws.close();
}

main().catch(e => console.error('Error:', e.message));
