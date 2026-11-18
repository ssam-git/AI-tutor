/*
 * Regression checks for the step model in api-learning.html.
 *
 *   node dev/check-steps.js [path-to-html]        (defaults to ../api-learning.html)
 *
 * Three checks over every scenario x API type x client language x server language
 * combination (6 x 4 x 4 x 4 = 384):
 *
 *   1. LINE order  - the highlighted line must never move UP inside a pane. This is what
 *                    buildSteps() guarantees by merging the three streams while keeping each
 *                    side's source order; if it breaks, a snippet was reordered or the merge
 *                    was changed.
 *   2. PHASE order - a pane's source order must agree with the phase numbers in PH_BASE /
 *                    phases(). A violation means either the phase map or the snippet layout
 *                    is wrong (the trace still steps down the page, but the two sides would
 *                    interleave at the wrong moment).
 *   3. CAUSAL order- wire events must still sit between the right code steps: the request
 *                    bytes after the client sends them, the route match after they land, the
 *                    client's decode after the response bytes arrive, and so on.
 */
const withPage = require('./cdp');

withPage(process.argv[2] || '../api-learning.html', async (ev, jsErrors) => {
  const res = await ev(`(() => {
    const lineInv = [], phaseInv = [], causal = [], warn = [];
    const warn0 = console.warn; console.warn = (m, k) => warn.push(String(m) + ' ' + String(k));
    let combos = 0;
    for (let si = 0; si < SCEN.length; si++)
      for (const api of ['rest','graphql','grpc','ws'])
        for (const cl of ['python','js','java','csharp'])
          for (const sv of ['python','js','java','csharp']) {
            combos++;
            state.si = si; state.api = api; state.cl = cl; state.sv = sv; regen();
            const st = state.steps;
            for (let i = 1; i < st.length; i++){
              const a = st[i-1], b = st[i];
              if (a.side !== b.side || a.side === 'wire' || a.line == null || b.line == null || a.k === b.k) continue;
              const tag = SCEN[si].id + '/' + api + '/' + a.side + '(' + (a.side === 'client' ? cl : sv) + ')';
              if (b.line < a.line) lineInv.push(tag + ': L' + (a.line+1) + ' ' + a.k + ' -> L' + (b.line+1) + ' ' + b.k);
              if (b.p < a.p) phaseInv.push(tag + ': ' + a.k + '(' + a.p + ') -> ' + b.k + '(' + b.p + ')');
            }
            const idx = k => st.findIndex(s => s.k === k);
            const widx = label => st.findIndex(s => s.side === 'wire' && (s.short || '').indexOf(label) === 0);
            const rule = (name, x, y) => { if (x >= 0 && y >= 0 && !(x < y)) causal.push(SCEN[si].id + '/' + api + '  ' + name + ' (' + x + ' !< ' + y + ')'); };
            if (api === 'ws'){
              rule('upgrade-before-accept', widx('upgrade'), idx('s.accept'));
              rule('accept-before-101', idx('s.accept'), widx('101'));
              rule('101-before-client-frame', widx('101'), idx('c.sendFrame'));
              rule('server-frame-before-client-read', widx('frame 1/'), idx('c.readChunk'));
            } else {
              rule('setup-before-dns', idx('c.setup'), widx('dns'));
              rule('send-before-request-line', idx('c.send') >= 0 ? idx('c.send') : idx('c.upgrade'), widx('request line'));
              rule('request-line-before-route', widx('request line'), idx('s.route'));
              rule('route-before-db', idx('s.route'), idx('s.db'));
              rule('db-before-response-bytes', idx('s.db'), widx('response body'));
              rule('server-headers-before-client-recv', idx('s.headers') >= 0 ? idx('s.headers') : idx('s.body'), idx('c.recvHeaders'));
              rule('recvHeaders-before-decode', idx('c.recvHeaders'), idx('c.decode'));
              rule('response-bytes-before-decode', widx('response body'), idx('c.decode'));
            }
          }
    console.warn = warn0;
    return { combos, lineInv, phaseInv, causal, warn };
  })()`);

  const uniq = a => [...new Set(a)];
  const show = (label, list, want) => {
    const u = uniq(list);
    console.log((u.length === want ? 'ok   ' : 'FAIL ') + label + ': ' + list.length + ' raw, ' + u.length + ' distinct');
    u.slice(0, 15).forEach(x => console.log('       ' + x));
  };
  console.log('combinations checked: ' + res.combos);
  show('1. highlight never moves up inside a pane', res.lineInv, 0);
  show('2. source order agrees with the phase map', res.phaseInv, 0);
  show('3. wire events keep causal order', res.causal, 0);
  console.log('unknown phase keys: ' + (res.warn.length ? uniq(res.warn).join(' | ') : 'none'));
  console.log('JS errors: ' + (jsErrors.length ? uniq(jsErrors).join(' | ') : 'none'));
  process.exitCode = (res.lineInv.length || res.phaseInv.length || res.causal.length || res.warn.length || jsErrors.length) ? 1 : 0;
});
