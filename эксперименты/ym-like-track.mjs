import http from 'node:http';
const data = await new Promise(r => http.get('http://localhost:9222/json', res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(JSON.parse(d))); }));
const page = data.find(t => t.type === 'page' && t.url.includes('music-application'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 1;
function send(m, p) {
    return new Promise(res => {
        let mid = id++; ws.send(JSON.stringify({id:mid, method:m, params:p}));
        let h = e => { try { let r = JSON.parse(e.data); if (r.id === mid) { ws.removeEventListener('message', h); res(r); } } catch{} };
        ws.addEventListener('message', h);
        setTimeout(() => { ws.removeEventListener('message', h); res({}); }, 5000);
    });
}

// Look for like button in player bar - by SVG icon or aria-label
const r = await send('Runtime.evaluate', { expression: `(function(){
    // Check buttons for inner SVG - like button usually has a heart SVG
    var btns = document.querySelectorAll('button');
    for (var btn of btns) {
        var rect = btn.getBoundingClientRect();
        if (rect.top > window.innerHeight - 150 && rect.width > 10) {
            // Check aria-label
            var label = btn.getAttribute('aria-label') || '';
            if (label) {
                if (label.includes('like') || label.includes('Like') || label.includes('нравится') || label.includes('Нравится') || label.includes('лайк')) {
                    btn.click();
                    return 'clicked by aria: ' + label;
                }
            }
            // Check inner SVG paths for heart shape
            var svg = btn.querySelector('svg, path');
            if (svg) {
                var d = svg.getAttribute('d') || '';
                if (d.includes('M12') && d.includes('l-') && d.length > 50) { // possible heart path
                    btn.click();
                    return 'clicked by svg: ' + btn.className.substring(0,30);
                }
            }
        }
    }
    
    // Second pass: look at all buttons in controls area, try the 4th-5th buttons (usually like/dislike)
    var controlBtns = [];
    for (var btn of document.querySelectorAll('button')) {
        var rect = btn.getBoundingClientRect();
        if (rect.top > window.innerHeight - 150 && rect.width > 20 && btn.className.includes('UDMY')) {
            controlBtns.push({btn: btn, x: rect.x});
        }
    }
    controlBtns.sort(function(a,b) { return a.x - b.x; });
    
    // Like button is usually the 4th or 5th button
    var likeBtn = controlBtns[3] || controlBtns[4];
    if (likeBtn) {
        likeBtn.btn.click();
        return 'clicked button #' + (controlBtns.indexOf(likeBtn)) + ' at x=' + likeBtn.x;
    }
    
    return 'not found';
})()`, returnByValue: true });
console.log(r?.result?.result?.value || JSON.stringify(r));

await new Promise(r => setTimeout(r, 1000));

// Check if like was registered - look for active/filled like
const check = await send('Runtime.evaluate', { expression: `(function(){
    var btns = document.querySelectorAll('button');
    for (var btn of btns) {
        var cn = typeof btn.className === 'string' ? btn.className : '';
        var rect = btn.getBoundingClientRect();
        if (rect.top > window.innerHeight - 150 && cn.includes('UDMY')) {
            // Check if this button has "active" or "filled" appearance
            var svgPaths = btn.querySelectorAll('path');
            for (var p of svgPaths) {
                var fill = p.getAttribute('fill') || '';
                if (fill && fill !== 'none' && fill !== 'transparent') {
                    return 'Button has filled svg: x=' + rect.x + ' fill=' + fill;
                }
            }
        }
    }
    return 'no filled buttons';
})()`, returnByValue: true });
console.log('After like:', check?.result?.result?.value);

ws.close();
