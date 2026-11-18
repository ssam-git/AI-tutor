/*
 * Layout check: does any scenario break the page at phone width?
 *
 *   node dev/check-layout.js                 both pages, 390 x 844
 *   W=320 H=640 node dev/check-layout.js     a small phone
 *
 * A tutorial page must never be wider than the viewport: a single long token (a base64
 * requestState, a hex dump, a header line) inside a pre-formatted block used to push the
 * document to 634 css px on a 390 px phone, which scales the whole page down and looks broken
 * rather than scrolled. So every combination is rendered, run to the end, and measured:
 *
 *   HARD - document scrollWidth must stay within the viewport, in each of the three views
 *          (client / server / trace) that a phone shows one at a time.
 *   SOFT - the code or trace box may scroll horizontally, but only if it really has to:
 *          a box wider than its own width means content nobody can reach by swiping.
 */
const withPage = require('./cdp');
const W = +(process.env.W || 390), H = +(process.env.H || 844);

const PAGES = [
  ['../api-learning.html', `
    for (let si = 0; si < SCEN.length; si++)
      for (const api of ['rest','graphql','grpc','ws'])
        for (const sv of ['python','js'])
          sweep(si, { api, sv, cl:'python' }, SCEN[si].id + '/' + api + '/' + sv);`],
  ['../mcp-learning.html', `
    for (let si = 0; si < SCEN.length; si++)
      for (const tr of ['http','stdio'])
        for (const rev of Object.keys(REVS))
          for (const sv of ['python','js'])
            sweep(si, { tr, rev, sv }, SCEN[si].id + '/' + tr + '/' + rev + '/' + sv);`],
];

(async () => {
  let bad = 0, combos = 0;
  for (const [file, loops] of PAGES){
    const res = await withPage(file, async (ev, jsErrors, { send }) => {
      await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await new Promise(r => setTimeout(r, 400));            // let the page re-run its resize path
      return ev(`(() => {
        const hard = [], soft = [], seen = [];
        let n = 0;
        const sweep = (si, sel, tag) => {
          n++;
          Object.entries(sel).forEach(([k, v]) => state[k] = v);
          state.si = si; regen();
          state.cur = state.steps.length - 1;
          renderTrace(); setActive();
          for (const v of ['cli','srv','trace']){
            setView(v);
            const de = document.documentElement;
            if (de.scrollWidth > ${W} + 1 || document.body.scrollWidth > ${W} + 1)
              hard.push(tag + ' [' + v + '] document is ' + de.scrollWidth + 'px wide');
            if (el('top').scrollWidth > el('top').clientWidth + 1)
              hard.push(tag + ' [' + v + '] top bar is ' + el('top').scrollWidth + 'px wide');
            const box = v === 'trace' ? el('trace') : v === 'cli' ? el('codeCli') : el('codeSrv');
            if (box.scrollWidth > box.clientWidth + 1)
              soft.push(tag + ' [' + v + '] ' + box.id + ' scrolls to ' + box.scrollWidth + 'px');
          }
        };
        ${loops}
        return { n, hard, soft };
      })()`);
    });
    combos += res.n;
    const h = [...new Set(res.hard)], s = [...new Set(res.soft)];
    console.log(file + ': ' + res.n + ' combinations at ' + W + 'x' + H);
    console.log((h.length ? '  FAIL document overflows the viewport:\n    ' : '  ok   no page is wider than the viewport\n') + h.slice(0, 12).join('\n    '));
    if (s.length) console.log('  note: content scrolls inside a box (not a bug, just hard to read):\n    ' + s.slice(0, 12).join('\n    '));
    bad += h.length;
  }
  console.log('checked ' + combos + ' combinations; ' + (bad ? bad + ' overflow problems' : 'no overflow problems'));
  process.exitCode = bad ? 1 : 0;
})();
