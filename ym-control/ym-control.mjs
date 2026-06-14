import http from 'node:http';
const action = process.argv[2] || 'playpause';
const queryArg = process.argv.slice(3).join(' ');
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
    const r = await click('Пауза');
    if (r?.result?.result?.value === 'not found') {
        const r2 = await click('Воспроизведение');
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
} else if (action === 'nowplaying') {
    const r = await send(ws, 'Runtime.evaluate', {
        expression: `(function(){
            for (var b of document.querySelectorAll('button')) {
                var a = b.getAttribute('aria-label')||'';
                if (a.includes('Следующая')) {
                    var p = b;
                    for (var j = 0; j < 10; j++) {
                        p = p.parentElement;
                        if (!p) break;
                        var txt = p.innerText?.trim();
                        if (txt && txt.length > 5) return txt.substring(0, 300);
                    }
                }
            }
            return 'unknown';
        })()`,
        returnByValue: true
    });
    console.log(r?.result?.result?.value || '?');
} else if (action === 'search' || action === 'play') {
    if (!queryArg) { console.error('usage: ' + action + ' <query>'); process.exit(1); }
    await send(ws, 'Runtime.evaluate', {
        expression: `(function(){
            for (let s of document.querySelectorAll('span'))
                if (s.innerText?.trim() === 'Поиск') {
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
    await sleep(1500);
    await send(ws, 'Runtime.evaluate', {
        expression: `document.querySelector('input[type=search]')?.click()`,
        returnByValue: true
    });
    await sleep(200);
    await send(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA' });
    await sleep(100);
    await send(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' });
    await sleep(200);
    for (const ch of queryArg) {
        await send(ws, 'Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch });
        await sleep(25);
    }
    await sleep(2500);
    if (action === 'play') {
        const r = await send(ws, 'Runtime.evaluate', {
            expression: `(function(){
                var btns = document.querySelectorAll('button');
                var playerBottom = window.innerHeight - 200;
                for (var b of btns) {
                    var a = b.getAttribute('aria-label')||'';
                    if (a.includes('Воспроизведение')) {
                        var rect = b.getBoundingClientRect();
                        if (rect.top < playerBottom) {
                            b.click();
                            return 'playing';
                        }
                    }
                }
                return 'not found';
            })()`,
            returnByValue: true
        });
        console.log(r?.result?.result?.value || '?');
    } else {
        const state = await send(ws, 'Runtime.evaluate', {
            expression: `(function(){
                var text = document.body.innerText;
                var idx = text.indexOf('Треки');
                var relevant = idx >= 0 ? text.substring(idx) : text;
                return relevant.substring(0, 2000);
            })()`,
            returnByValue: true
        });
        console.log(state?.result?.result?.value || '');
    }
} else {
    console.error('unknown action:', action);
    process.exit(1);
}

await sleep(200);
ws.close();
