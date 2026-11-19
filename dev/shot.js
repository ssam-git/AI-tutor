/*
 * Screenshot jobs, for eyeballing what a change did. Same zero-dependency CDP approach as
 * the checks; a job list is a JSON file:
 *
 *   [
 *     { "url":"file:///…/mcp-learning.html", "w":1100, "h":760, "out":"/tmp/a.png",
 *       "mobile":false,
 *       "eval":"state.si=SCEN.findIndex(s=>s.id==='live');regen();1" }
 *   ]
 *
 *   node dev/shot.js /tmp/jobs.json
 *
 * "eval" runs before the shot and prints its return value, so it doubles as a way to drive
 * the page into a state (pick a scenario, step to the end) and to report what the page
 * measured. "url" may be a file:// URL - the pages are meant to work from a plain folder.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME ||
  ['/home/sam/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
   '/usr/bin/chromium', '/usr/bin/google-chrome',
   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    .find(p => { try { fs.accessSync(p); return true; } catch (e) { return false; } });
if (!CHROME){ console.error('no chromium found - set CHROME=/path/to/chrome'); process.exit(2); }

const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const PORT = 9340 + (process.pid % 40);

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
    '--hide-scrollbars', '--remote-debugging-port=' + PORT,
    '--user-data-dir=/tmp/ai-tutor-shot-' + process.pid, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let target;
  for (let i = 0; i < 60; i++){
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
          target = l.find(t => t.type === 'page'); if (target) break; } catch (e) {}
    await wait(250);
  }
  if (!target){ console.error('no chromium devtools endpoint'); chrome.kill(); process.exit(2); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let mid = 0; const pending = new Map(); const errors = [];
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++mid; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)){ const q = pending.get(m.id); pending.delete(m.id);
      m.error ? q.rej(new Error(JSON.stringify(m.error))) : q.res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown')
      errors.push('EXC ' + String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('LOG ' + m.params.entry.text);
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');

  for (const j of jobs){
    await send('Emulation.setDeviceMetricsOverride', { width: j.w || 1280, height: j.h || 800,
      deviceScaleFactor: j.dsf || 2, mobile: !!j.mobile });
    if (j.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.navigate', { url: j.url.startsWith('file:') || /^https?:/.test(j.url) ? j.url : 'file://' + path.resolve(j.url) });
    await wait(j.wait || 1200);
    if (j.eval){
      const r = await send('Runtime.evaluate', { expression: j.eval, awaitPromise: true, returnByValue: true });
      console.log((j.name || j.out) + ' EVAL ' + JSON.stringify(r.result.value));
      await wait(j.after || 150);
    }
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!j.beyond,
      /* clip: {x,y,width,height,scale} in css px - zoom into one grip to see it clearly */
      ...(j.clip ? { clip: { ...j.clip, scale: j.clip.scale || 2 } } : {}) });
    fs.writeFileSync(j.out, Buffer.from(s.data, 'base64'));
    console.log('wrote ' + j.out);
  }
  console.log(errors.length ? 'ERRORS ' + JSON.stringify(errors, null, 1) : 'no page errors');
  ws.close(); chrome.kill();
})().catch(e => { console.error('FAIL ' + e.message); try { chrome.kill(); } catch (x) {} process.exit(1); });
