/*
 * Layout check: two viewports, every scenario, two things that must not happen.
 *
 *   node dev/check-layout.js                  390x844 phone + 1100x760 desktop
 *   W=320 H=640 node dev/check-layout.js      also run a small phone pass
 *
 * 1. NO WIDER PAGE. A tutorial page must never be wider than the viewport. A single long
 *    token (a base64 requestState, a hex dump, a header line) inside a pre-formatted block
 *    once pushed the document to 634 css px on a 390 px phone; the browser scales the page
 *    down to fit, which does not read as "scroll sideways", it reads as "broken".
 *
 * 2. CONTROLS THAT DO NOT MOVE. The back links, the scenario select and the Run button must
 *    land on the same pixel for every scenario. They used not to: the chips row under the run
 *    buttons changes width per scenario, which resized the grid column the title row was
 *    anchored to - picking "live server push" slid the links 300px left. So the title row and
 *    the scenario blurb span the whole top pane, and this check pins them.
 *
 * A box may still scroll horizontally when it genuinely has to (long code line); that is
 * reported as a note, not a failure.
 */
const withPage = require('./cdp');

const VIEWS = [{ w: +(process.env.W || 390), h: +(process.env.H || 844), mobile: true },
               { w: +(process.env.DW || 1100), h: +(process.env.DH || 760), mobile: false }];

const LOOPS = {
  'api-learning.html': `
    for (let si = 0; si < SCEN.length; si++)
      for (const api of ['rest','graphql','grpc','ws'])
        for (const sv of ['python','js'])
          sweep(si, { api, sv, cl:'python' }, SCEN[si].id + '/' + api + '/' + sv);`,
  'mcp-learning.html': `
    for (let si = 0; si < SCEN.length; si++)
      for (const tr of ['http','stdio'])
        for (const rev of Object.keys(REVS))
          for (const sv of ['python','js'])
            sweep(si, { tr, rev, sv }, SCEN[si].id + '/' + tr + '/' + rev + '/' + sv);`,
};

(async () => {
  let bad = 0, combos = 0;
  for (const page of Object.keys(LOOPS)){
    for (const v of VIEWS){
      const res = await withPage('../' + page, async (ev, jsErrors, { send }) => {
        await send('Emulation.setDeviceMetricsOverride', { width: v.w, height: v.h, deviceScaleFactor: 2, mobile: v.mobile });
        if (v.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await new Promise(r => setTimeout(r, 400));            // let the page re-run its resize path
        return ev(`(() => {
          const hard = [], soft = [], anchors = [];
          let n = 0;
          const sweep = (si, sel, tag) => {
            n++;
            Object.entries(sel).forEach(([k, val]) => state[k] = val);
            state.si = si; regen();
            state.cur = state.steps.length - 1;
            renderTrace(); setActive();
            const x = sel => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().x) : -1; };
            anchors.push([tag, x('a.back[title="more AI-built tutorials"]'), x('.pick select'), x('#runBtn')]);
            for (const view of ['cli','srv','trace']){
              setView(view);
              const de = document.documentElement;
              if (de.scrollWidth > ${v.w} + 1 || document.body.scrollWidth > ${v.w} + 1)
                hard.push(tag + ' [' + view + '] document is ' + de.scrollWidth + 'px wide');
              if (el('top').scrollWidth > el('top').clientWidth + 1)
                hard.push(tag + ' [' + view + '] top bar is ' + el('top').scrollWidth + 'px wide');
              const box = view === 'trace' ? el('trace') : view === 'cli' ? el('codeCli') : el('codeSrv');
              if (box.scrollWidth > box.clientWidth + 1)
                soft.push(tag + ' [' + view + '] ' + box.id + ' scrolls to ' + box.scrollWidth + 'px');
            }
          };
          ${LOOPS[page]}
          ['back link','scenario select','run button'].forEach((label, i) => {
            const col = i + 1, xs = anchors.map(a => a[col]);
            const spread = Math.max(...xs) - Math.min(...xs);
            if (spread > 1) hard.push(label + ' drifts ' + spread + 'px between scenarios (x ' + Math.min(...xs) + ' -> ' + Math.max(...xs) + ')');
          });
          return { n, hard, soft };
        })()`);
      });
      combos += res.n;
      const h = [...new Set(res.hard)], s = [...new Set(res.soft)];
      console.log(page + ' at ' + v.w + 'x' + v.h + ': ' + res.n + ' combinations');
      console.log((h.length ? '  FAIL\n    ' : '  ok   no overflow, no drifting controls\n') + h.slice(0, 12).join('\n    '));
      if (s.length) console.log('  note (not a failure, content scrolls inside its own box):\n    ' + s.slice(0, 6).join('\n    '));
      bad += h.length;
    }
  }
  console.log('checked ' + combos + ' combinations across ' + VIEWS.length + ' viewports; ' +
              (bad ? bad + ' problems' : 'no problems'));
  process.exitCode = bad ? 1 : 0;
})();
