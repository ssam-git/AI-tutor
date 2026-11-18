/*
 * Tiny CDP driver shared by the dev checks. No test framework, no dependencies:
 * it starts headless chromium, loads a local page, and hands you an evaluate() helper.
 *
 *   const withPage = require('./cdp');
 *   await withPage('../api-learning.html', async (ev, jsErrors) => { ... });
 *
 *   ev('1 + 1')            -> 2   (runs in the page, returnByValue)
 *   jsErrors               -> any uncaught exceptions the page threw while you worked
 *
 * CHROME=/path/to/chrome to point at another build; default is a playwright chromium.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHROME = process.env.CHROME ||
  ['/home/sam/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
   '/usr/bin/chromium', '/usr/bin/google-chrome',
   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    .find(p => { try { fs.accessSync(p); return true; } catch (e) { return false; } });

module.exports = async function withPage(file, fn){
  if (!CHROME){ console.error('no chromium found - set CHROME=/path/to/chrome'); process.exit(2); }
  const url = 'file://' + path.resolve(__dirname, file);
  const PORT = 9400 + (process.pid % 50);
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/ai-tutor-check-' + process.pid,
    'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const die = msg => { try { chrome.kill(); } catch (e) {} console.error(msg); process.exit(2); };
  let target;
  for (let i = 0; i < 60; i++){
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
          target = l.find(t => t.type === 'page'); if (target) break; } catch (e) {}
    await wait(250);
  }
  if (!target) die('could not reach the chromium devtools endpoint');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let mid = 0; const pending = new Map(); const jsErrors = [];
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++mid; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)){
      const q = pending.get(m.id); pending.delete(m.id);
      m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown'){
      const d = m.params.exceptionDetails;
      jsErrors.push(String(d.exception && d.exception.description || d.text).split('\n')[0]);
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Page.enable');
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails));
    return r.result.value;
  };
  await send('Page.navigate', { url });
  await wait(1000);
  try {
    const out = await fn(ev, jsErrors);
    ws.close(); chrome.kill();
    return out;
  } catch (e) { ws.close(); die('harness error: ' + e.message); }
};
