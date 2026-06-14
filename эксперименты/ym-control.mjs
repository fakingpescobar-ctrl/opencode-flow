import http from 'node:http';
const action = process.argv[2] || 'playpause';
function getTargets() {
    return new Promise((resolve, reject) => {
        http.get('http://localhost:9222/json', (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
    });
}
function connectCDP(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.addEventListener('open', () => resolve(ws));
        ws.addEventListener('error', reject);
        setTimeout(() => reject('timeout'), 5000);
    });
}
function send(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 100000);
        ws.send(JSON.stringify({ id, method, params }));
        const handler = (e) => {
            try { const r = JSON.parse(e.data.toString()); if (r.id === id) { ws.removeEventListener('message', handler); resolve(r); } } catch {}
        };
        ws.addEventListener('message', handler);
        setTimeout(() => { ws.removeEventListener('message', handler); reject('timeout'); }, 10000);
    });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const targets = await getTargets();
const page = targets.find(t => t.type === 'page' && t.url.includes('music-application'));
if (!page) { console.error('YM page not found'); process.exit(1); }
const ws = await connectCDP(page.webSocketDebuggerUrl);

const click = (ariaMatch) => send(ws, 'Runtime.evaluate', {
    expression: `(function(){
        for (var b of document.querySelectorAll('button')) {
            var a = b.getAttribute('aria-label')||'';
            if (a.includes('${ariaMatch}')) {b.click();return'ok';}
        }
        return 'not found';
    })()`,
    returnByValue: true
});

if (action === 'next') {
    const r = await click('Следующая');
    console.log('next ' + (r?.result?.result?.value || '?'));
} else if (action === 'prev') {
    // Double-click for prev (restart then actual prev)
    await click('Предыдущая');
    await sleep(400);
    const r = await click('Предыдущая');
    console.log('prev ' + (r?.result?.result?.value || '?'));
} else if (action === 'playpause') {
    const r = await click('Воспроизведение');
    if (r?.result?.result?.value === 'not found') {
        const r2 = await click('Пауза');
        console.log('playpause ' + (r2?.result?.result?.value || '?'));
    } else {
        console.log('playpause ' + (r?.result?.result?.value || '?'));
    }
} else if (action === 'mute') {
    let r = await send(ws, 'Runtime.evaluate', {
        expression: `document.querySelector('[data-test-id=CHANGE_VOLUME_BUTTON]')?.click()||'ok'`,
        returnByValue: true
    });
    if (r?.result?.result?.value !== 'ok') {
        r = await click('Выключить');
    }
    console.log('mute ok');
} else if (action.startsWith('volume_')) {
    const vol = parseInt(action.split('_')[1], 10);
    if (isNaN(vol)) { console.error('bad volume'); process.exit(1); }
    const r = await send(ws, 'Runtime.evaluate', {
        expression: `(function(){
            var slider = document.querySelector('[data-test-id=CHANGE_VOLUME_SLIDER]');
            if (slider) {
                var ns = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
                ns.call(slider,'${vol}');
                slider.dispatchEvent(new Event('input',{bubbles:true}));
                slider.dispatchEvent(new Event('change',{bubbles:true}));
                return 'ok';
            }
            return 'not found';
        })()`,
        returnByValue: true
    });
    console.log('volume ' + (r?.result?.result?.value || '?'));
} else {
    console.error('unknown action:', action);
    process.exit(1);
}

await sleep(200);
ws.close();
