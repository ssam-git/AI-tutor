/*
 * Regression checks for the step model in mcp-learning.html.
 *
 *   node dev/check-mcp.js [path-to-html]          (defaults to ../mcp-learning.html)
 *
 * 4 scenarios x 2 transports x 3 revisions x 2 client languages x 2 server languages = 96 combos:
 *
 *   1. LINE order   - the highlight must never move up inside a pane (engine guarantee).
 *   2. PHASE order  - snippet source order must agree with the phase map.
 *   3. CAUSAL order - the JSON-RPC frames must sit between the right code steps: the request
 *                     after the client writes it, the dispatch after it lands, the answer
 *                     before the client reads it, and for multi round-trip calls the retry
 *                     strictly after the human answered.
 *   4. REVISIONS    - each revision must show only its own protocol shape: no initialize or
 *                     Mcp-Session-Id in 2026-07-28, no server/discover before it, no
 *                     structuredContent in 2025-03-26, and stdio must carry no HTTP at all.
 */
const withPage = require('./cdp');

withPage(process.argv[2] || '../mcp-learning.html', async (ev, jsErrors) => {
  const res = await ev(`(() => {
    const lineInv = [], phaseInv = [], causal = [], shape = [], warn = [];
    const warn0 = console.warn; console.warn = (m, k) => warn.push(String(m) + ' ' + String(k));
    let combos = 0;
    for (let si = 0; si < SCEN.length; si++)
      for (const tr of ['http','stdio'])
        for (const rev of Object.keys(REVS))
          for (const sv of ['python','js'])
          for (const cl of ['ts','py']){
            combos++;
            const sc = SCEN[si].id;
            state.si = si; state.tr = tr; state.rev = rev; state.sv = sv; state.cl = cl; regen();
            const st = state.steps;
            const tag = sc + '/' + tr + '/' + rev + '/' + cl + '/' + sv;
            const cliTxt = state.clLines.map(l => l.t).join('\\n');
            const svTxt = state.svLines.map(l => l.t).join('\\n');

            for (let i = 1; i < st.length; i++){
              const a = st[i-1], b = st[i];
              if (a.side !== b.side || a.side === 'wire' || a.line == null || b.line == null || a.k === b.k) continue;
              const side = a.side === 'client' ? 'client(' + cl + ')' : 'server(' + sv + ')';
              if (b.line < a.line) lineInv.push(tag + ' ' + side + ': L' + (a.line+1) + ' ' + a.k + ' -> L' + (b.line+1) + ' ' + b.k);
              if (b.p < a.p) phaseInv.push(tag + ' ' + side + ': ' + a.k + '(' + a.p + ') -> ' + b.k + '(' + b.p + ')');
            }

            const idx  = k => st.findIndex(s => s.k === k);
            const w    = label => st.findIndex(s => s.side === 'wire' && (s.short || '').indexOf(label) === 0);
            const wall = label => st.reduce((a, s, i) => (s.side === 'wire' && (s.short || '').indexOf(label) === 0 ? a.concat(i) : a), []);
            const wtxt = needle => st.some(s => s.side === 'wire' && (s.txt || '').indexOf(needle) >= 0);
            const rule = (name, x, y) => { if (x >= 0 && y >= 0 && !(x < y)) causal.push(tag + '  ' + name + ' (' + x + ' !< ' + y + ')'); };

            /* every scenario: the transport exists before any message, and messages sit
               between the code that wrote them and the code that reacts to them */
            rule('setup-before-transport', idx('c.setup'), w('spawn') >= 0 ? w('spawn') : w('transport'));
            rule('connect-before-first-message', idx('c.connect'), w('→ server/discover') >= 0 ? w('→ server/discover') : w('→ initialize'));
            rule('call-code-before-request-frame', idx('c.call'), w('→ tools/call'));
            rule('request-before-dispatch', w('→ tools/call'), idx('s.route'));
            rule('dispatch-before-upstream', idx('s.route'), idx('s.db'));
            rule('upstream-before-answer-frame', idx('s.db'), w('← id 5 answer'));
            rule('answer-frame-before-client-uses-it', w('← id 5 answer'), idx('c.result'));
            rule('result-before-model-answer', idx('c.result'), idx('c.answer'));
            rule('close-is-last', idx('c.answer'), idx('c.close'));
            if (tr === 'http'){
              rule('post-headers-before-frame', w('POST /mcp'), w('→ tools/call') >= 0 ? w('→ tools/call') : w('→ server/discover'));
              rule('http-status-before-body', w('HTTP 200'), w('← id 5 answer') >= 0 ? w('← id 5 answer') : w('← id 1 answer'));
            }
            if (tr === 'stdio' && st.some(s => s.side === 'wire' && s.short === 'POST /mcp'))
              shape.push(tag + '  stdio carries an HTTP POST frame');
            if (tr === 'stdio' && wtxt('mcp-session-id')) shape.push(tag + '  stdio shows a session header');

            if (sc === 'discover'){
              const first = w('→ server/discover') >= 0 ? w('→ server/discover') : w('→ initialize');
              rule('first-request-before-its-answer', first, w('← id 1 answer'));
              rule('answer-before-tools-list', w('← id 1 answer'), w('→ tools/list'));
              rule('list-frame-before-list-code?', w('→ tools/list'), idx('s.listR'));
              rule('list-answer-before-close', w('← id 2 answer'), idx('c.close'));
              if (rev === '2026-07-28') rule('no-initialized-notification', w('→ notifications/initialized'), idx('c.close'));
              else rule('initialized-before-tools-list', w('→ notifications/initialized'), w('→ tools/list'));
            }
            if (sc === 'error'){
              const calls = w('→ tools/call'), calls2 = wall('→ tools/call')[1];
              rule('tool-error-is-a-result', w('← id 5 answer'), idx('c.result'));
              rule('model-reacts-before-second-call', idx('c.answer'), calls2);
              rule('second-request-before-proto-error', calls2, w('← id 6 error'));
              rule('proto-error-before-client-catch', w('← id 6 error'), idx('c.err'));
            }
            if (sc === 'mrtr'){
              if (rev === '2026-07-28'){
                if (cl === 'ts'){
                  rule('ask-before-human', w('← id 5 answer'), idx('c.elicit'));
                  rule('human-before-retry', idx('c.elicit'), idx('c.retry'));
                } else {
                  rule('callback-defined-before-call', idx('c.elicit'), w('→ tools/call'));
                }
                const calls2 = wall('→ tools/call')[1];
                rule('retry-frame-after-retry-code', idx('c.retry'), calls2);
                rule('retry-frame-before-resume', calls2, idx('s.retry'));
                rule('resume-before-side-effect', idx('s.retry'), idx('s.tool'));
                rule('side-effect-before-final-answer', idx('s.tool'), w('← id 6 answer'));
                rule('final-answer-before-client-result', w('← id 6 answer'), idx('c.result'));
                if (!wtxt('input_required')) shape.push(tag + '  no input_required frame');
                if (wtxt('elicitation/create')) shape.push(tag + '  2026-07-28 shows a server-initiated elicitation');
              } else if (rev === '2025-11-25'){
                rule('call-before-back-request', w('→ tools/call'), w('← elicitation/create'));
                rule('back-request-before-answer', w('← elicitation/create'), w('→ id 90 answer'));
                rule('answer-before-side-effect', w('→ id 90 answer'), idx('s.tool'));
                rule('side-effect-before-result', idx('s.tool'), w('← id 5 answer'));
                if (wtxt('input_required')) shape.push(tag + '  2025-11-25 shows MRTR input_required');
              } else {
                if (wtxt('elicitation') || wtxt('input_required')) shape.push(tag + '  2025-03-26 shows an elicitation it does not have');
                if (!wtxt('refused')) shape.push(tag + '  2025-03-26 mrtr answer is not a refusal');
              }
            }
            if (cl === 'py' && sc === 'mrtr' && rev === '2025-11-25' && !/mode="legacy"/.test(cliTxt))
              shape.push(tag + '  a python client answering a back-channel request needs mode="legacy"');
            if (cl === 'py' && rev === '2026-07-28' && /mode="legacy"/.test(cliTxt))
              shape.push(tag + '  mode="legacy" on a 2026-07-28 client');
            if (cl === 'py' && sc === 'call' && !/structured_content/.test(cliTxt))
              shape.push(tag + '  python client should read structured_content');
            if (cl === 'ts' && sc === 'call' && !/structuredContent/.test(cliTxt))
              shape.push(tag + '  typescript client should read structuredContent');
            if (cl === 'py' && sc === 'error' && !/is_error/.test(cliTxt))
              shape.push(tag + '  python client should read is_error');
            /* the schema the wire advertises and the declaration in the pane must agree.
               an enum in the tools/list frame has to come from a constraint in the code,
               and a constraint in the code has to reach the wire */
            const wireEnum = wtxt('"enum":');
            const declared = sv === 'python'
              ? svTxt.indexOf('Literal["metric", "imperial"]') >= 0
              : svTxt.indexOf('z.enum(["metric","imperial"])') >= 0;
            if (sc !== 'mrtr' && wireEnum && !declared)
              shape.push(tag + '  tools/list advertises an enum the ' + sv + ' snippet does not declare');
            if (sc === 'discover' && declared && !wireEnum)
              shape.push(tag + '  the ' + sv + ' snippet constrains units but no enum reaches the wire');
            if (sc === 'call'){
              if (rev === '2025-03-26' && wtxt('structuredContent')) shape.push(tag + '  2025-03-26 shows structuredContent');
              if (rev !== '2025-03-26' && !wtxt('structuredContent')) shape.push(tag + '  missing structuredContent');
              if (wtxt('ttlMs') !== (rev === '2026-07-28')) shape.push(tag + '  ttlMs/cacheScope mismatch');   /* only the 2026 result carries them */
            }
            if (rev === '2026-07-28'){
              if (wtxt('initialize')) shape.push(tag + '  2026-07-28 shows an initialize handshake');
              if (wtxt('Mcp-Session-Id') || wtxt('mcp-session-id')) shape.push(tag + '  2026-07-28 shows a session id');
              if (tr === 'http' && !wtxt('mcp-method')) shape.push(tag + '  2026-07-28 http POST lacks Mcp-Method');
              if (!wtxt('io.modelcontextprotocol/protocolVersion')) shape.push(tag + '  2026-07-28 request has no _meta version');
            } else {
              if (w('→ server/discover') >= 0) shape.push(tag + '  ' + rev + ' shows server/discover');
              if (tr === 'http' && !wtxt('mcp-session-id')) shape.push(tag + '  ' + rev + ' http has no session id');
              if (sc === 'discover' && !wtxt('"protocolVersion"')) shape.push(tag + '  ' + rev + ' initialize has no protocolVersion');
            }
          }
    console.warn = warn0;
    return { combos, lineInv, phaseInv, causal, shape, warn };
  })()`);

  const uniq = a => [...new Set(a)];
  const show = (label, list) => {
    const u = uniq(list);
    console.log((u.length ? 'FAIL ' : 'ok   ') + label + ': ' + list.length + ' raw, ' + u.length + ' distinct');
    u.slice(0, 20).forEach(x => console.log('       ' + x));
  };
  console.log('combinations checked: ' + res.combos);
  show('1. highlight never moves up inside a pane', res.lineInv);
  show('2. source order agrees with the phase map', res.phaseInv);
  show('3. frames keep causal order', res.causal);
  show('4. each revision shows only its own protocol shape', res.shape);
  console.log('unknown phase keys: ' + (res.warn.length ? uniq(res.warn).join(' | ') : 'none'));
  console.log('JS errors: ' + (jsErrors.length ? uniq(jsErrors).join(' | ') : 'none'));
  process.exitCode = (res.lineInv.length || res.phaseInv.length || res.causal.length || res.shape.length || res.warn.length || jsErrors.length) ? 1 : 0;
});
