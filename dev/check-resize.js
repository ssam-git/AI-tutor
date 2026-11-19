#!/usr/bin/env node
/* dev/check-resize.js - the panes are resizable; this proves the resizing behaves:
   a real pointer drag moves the split, the two code panes trade width instead of
   growing the page, the grips clamp at their limits, arrows nudge, Home resets,
   the size survives a reload, and none of it steals the stepping keys.

   node dev/check-resize.js api-learning.html mcp-learning.html
*/
const withPage = require('./cdp.js');
const FILES = process.argv.slice(2).filter(a => a.endsWith('.html'));
if (!FILES.length) { console.error('usage: node dev/check-resize.js api-learning.html mcp-learning.html'); process.exit(2); }

const fail = [];
const bad = (f, m) => fail.push(f + ': ' + m);
const near = (a, b, t) => Math.abs(a - b) <= t;

const GEO = `(() => {
  const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return {w:b.width,h:b.height,x:b.x,y:b.y}; };
  return { mid:r('mid'), cli:r('paneCli'), srv:r('paneSrv'), bot:r('bot'), vs:r('vsplit'), hs:r('hsplit'),
           doc:{w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight},
           win:{w:innerWidth,h:innerHeight}, cur:state.cur, steps:state.steps.length };
})()`;

(async () => {
  for (const file of FILES){
    await withPage('../' + file, async (ev, jsErrors, { send, wait }) => {
      const geo = () => ev(GEO);
      await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 760, deviceScaleFactor: 1, mobile: false });
      await wait(300);
      const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
      const drag = async (x, y, dx, dy) => {
        await mouse('mousePressed', x, y);
        for (let i = 1; i <= 8; i++) await mouse('mouseMoved', x + dx * i / 8, y + dy * i / 8);
        await mouse('mouseReleased', x + dx, y + dy);
        await wait(80);
      };
      const key = async k => {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, text: '', windowsVirtualKeyCode: 0 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, windowsVirtualKeyCode: 0 });
        await wait(40);
      };

      /* the grips must be visible, not just present: an empty or transparent ::before
         would leave an invisible hit strip nobody would think to grab */
      const look = await ev(`(() => { const b = id => { const s = getComputedStyle(document.getElementById(id), '::before');
        return { w: parseFloat(s.width), h: parseFloat(s.height), bg: s.backgroundColor, content: s.content }; };
        return { v: b('vsplit'), h: b('hsplit') }; })()`);
      if (look.v.w < 4 || look.v.h < 40 || /rgba\(0, 0, 0, 0\)|transparent/.test(look.v.bg))
        bad(file, `the vertical grip is invisible (${JSON.stringify(look.v)})`);
      if (look.h.w < 60 || look.h.h < 4 || /rgba\(0, 0, 0, 0\)|transparent/.test(look.h.bg))
        bad(file, `the horizontal grip is invisible (${JSON.stringify(look.h)})`);

      /* start even */
      let g = await geo();
      if (!near(g.cli.w, g.srv.w, 2)) bad(file, `the split does not start even (${g.cli.w} vs ${g.srv.w})`);
      const sum0 = g.cli.w + g.srv.w;

      /* real pointer drag on the vertical grip */
      let g2 = await geo();
      await drag(g2.vs.x + g2.vs.w / 2, g2.vs.y + g2.mid.h / 2, 120, 0);
      g = await geo();
      if (!near(g.cli.w + g.srv.w, sum0, 2)) bad(file, 'the panes grew instead of trading width');
      if (!near(g.cli.w, sum0 / 2 + 120, 3)) bad(file, `the drag moved the split the wrong amount (${g.cli.w})`);
      if (g.doc.w > g.win.w + 1) bad(file, `resizing widened the document (${g.doc.w} > ${g.win.w})`);
      const dragged = g.cli.w;

      /* clamp at both ends */
      g2 = await geo();
      await drag(g2.vs.x + g2.vs.w / 2, g2.vs.y + g2.mid.h / 2, 1400, 0);
      g = await geo();
      if (g.srv.w < 199) bad(file, `the server pane shrank below its 200px floor (${g.srv.w})`);
      g2 = await geo();
      await drag(g2.vs.x + g2.vs.w / 2, g2.vs.y + g2.mid.h / 2, -1400, 0);
      g = await geo();
      if (g.cli.w < 199) bad(file, `the client pane shrank below its 200px floor (${g.cli.w})`);
      if (g.doc.w > g.win.w + 1) bad(file, 'clamping still let the page overflow');

      /* arrows nudge the focused grip, and still step elsewhere */
      g2 = await geo();
      const before = g2.cli.w;
      await ev(`document.getElementById('vsplit').focus()`);
      await key('ArrowRight'); await key('ArrowRight');
      g = await geo();
      if (!near(g.cli.w, before + 48, 1)) bad(file, `ArrowRight on the grip should add 24px per press (${before} -> ${g.cli.w})`);
      await ev(`document.getElementById('vsplit').blur(); state.cur = 0`);
      await key('ArrowRight');
      g = await geo();
      if (g.cur !== 1) bad(file, `ArrowRight no longer steps the walkthrough when the grip is not focused (cur=${g.cur})`);

      /* Home resets */
      await ev(`document.getElementById('vsplit').focus()`);
      await key('Home');
      g = await geo();
      if (!near(g.cli.w, g.srv.w, 2)) bad(file, `Home on the grip should restore an even split (${g.cli.w} vs ${g.srv.w})`);

      /* the trace grip: up = more trace */
      const bot0 = (await geo()).bot.h;
      g2 = await geo();
      await drag(g2.hs.x + 60, g2.hs.y + g2.hs.h / 2, 0, -100);
      let b1 = (await geo()).bot.h;
      if (!near(b1, bot0 + 100, 5)) bad(file, `dragging the trace grip up 100px did not grow it (${bot0} -> ${b1})`);
      g = await geo();
      if (g.doc.h > g.win.h + 1) bad(file, `a taller trace made the whole document scroll (${g.doc.h} > ${g.win.h})`);
      g2 = await geo();
      await drag(g2.hs.x + 60, g2.hs.y + g2.hs.h / 2, 0, 1400);
      g = await geo();
      if (g.bot.h < 89) bad(file, `the trace collapsed below its 90px floor (${g.bot.h})`);
      if (g.cli.h < 60) bad(file, `the code panes were squeezed to ${g.cli.h}px`);

      /* survives a reload */
      const savedCli = g.cli.w, savedBot = g.bot.h;
      await send('Page.navigate', { url: 'file://' + require('path').resolve(__dirname, '..', file) });
      await wait(1200);
      g = await geo();
      if (!near(g.cli.w, savedCli, 2)) bad(file, `the split did not survive a reload (${savedCli} -> ${g.cli.w})`);
      if (!near(g.bot.h, savedBot, 2)) bad(file, `the trace height did not survive a reload (${savedBot} -> ${g.bot.h})`);
      await ev(`localStorage.clear()`);
      await send('Page.navigate', { url: 'file://' + require('path').resolve(__dirname, '..', file) });
      await wait(1200);
      g = await geo();
      if (!near(g.cli.w, g.srv.w, 2)) bad(file, 'after clearing storage the split is not even again');

      /* narrow desktop: clamps keep everything inside the window */
      await send('Emulation.setDeviceMetricsOverride', { width: 861, height: 700, deviceScaleFactor: 1, mobile: false });
      await wait(300);
      await ev(`setColA(9000); setTraceH(9000)`);
      await wait(200);
      g = await geo();
      if (g.doc.w > g.win.w + 1) bad(file, `at 861px wide a big split overflows the page (${g.doc.w} > ${g.win.w})`);
      if (g.cli.w < 199 || g.srv.w < 199) bad(file, `at 861px wide the panes are not clamped (${g.cli.w}/${g.srv.w})`);
      const narrow = { cli:g.cli.w, srv:g.srv.w, trace:g.bot.h };
      if (g.doc.h > g.win.h + 1) bad(file, `at 700px tall a tall trace overflows (${g.doc.h} > ${g.win.h})`);

      /* phone: the grips are gone, one panel at a time */
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, haveTouch: true });
      await wait(300);
      g = await geo();
      if (g.vs.w > 0 || g.hs.w > 0) bad(file, `the grips are still laid out on a phone (${g.vs.w}/${g.hs.w})`);
      if (g.doc.w > g.win.w + 1) bad(file, `phone document overflows (${g.doc.w} > ${g.win.w})`);

      console.log(`${file}: split ${dragged.toFixed(0)}px after a 120px drag · clamped to ${narrow.cli.toFixed(0)}/${narrow.srv.toFixed(0)} at 861px wide · trace floor ${narrow.trace.toFixed(0)}px · grips hidden on a phone`);
      if (jsErrors.length) bad(file, 'JS errors: ' + jsErrors.join(' | '));
    });
  }
  if (fail.length){
    console.log('\nFAIL ' + fail.length + ' resizing problems:');
    for (const m of [...new Set(fail)]) console.log('  - ' + m);
    process.exit(1);
  }
  console.log('\nok   resizing holds: drags trade width, limits clamp, keys work, sizes persist, phones unaffected');
})().catch(e => { console.error(e); process.exit(2); });
