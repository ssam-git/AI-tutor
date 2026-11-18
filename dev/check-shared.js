/*
 * The step engine is copied into every tutorial so each page stays a single file you can
 * save and open anywhere. Copies are only useful if they behave the same, so this check
 * compares the block between  /* ==== ENGINE START ==== *\/  and  /* ==== ENGINE END ==== *\/
 * in every tutorial page. Fix a bug once, in one file, then copy the whole block over;
 * this script fails if the copies have drifted.
 *
 *   node dev/check-shared.js
 */
const fs = require('fs');
const path = require('path');

const START = '/* ==== ENGINE START ==== */';
const END   = '/* ==== ENGINE END ==== */';
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : ['api-learning.html', 'mcp-learning.html'];

const blocks = new Map();
for (const f of files){
  const p = path.join(__dirname, '..', f);
  const src = fs.readFileSync(p, 'utf8');
  const a = src.indexOf(START), b = src.indexOf(END);
  if (a < 0 || b < 0){ console.log('FAIL ' + f + ': no ENGINE block (looking for the two marker comments)'); process.exitCode = 1; continue; }
  blocks.set(f, src.slice(a, b + END.length));
}

const names = [...blocks.keys()];
const [first, ...rest] = names;
let bad = 0;
for (const f of rest){
  const x = blocks.get(first), y = blocks.get(f);
  if (x === y){ console.log('ok   ' + f + ' matches ' + first + ' (' + x.split('\n').length + ' lines)'); continue; }
  bad++;
  console.log('FAIL ' + f + ' differs from ' + first);
  const xl = x.split('\n'), yl = y.split('\n');
  for (let i = 0; i < Math.max(xl.length, yl.length); i++)
    if (xl[i] !== yl[i]) console.log('       line ' + (i + 1) + '\n         ' + first + ': ' + xl[i] + '\n         ' + f + ': ' + yl[i]);
}
console.log(bad ? 'ENGINE copies have drifted - copy the whole block from one file to the other' :
                 'engine in sync across ' + names.length + ' pages');
process.exitCode = process.exitCode || (bad ? 1 : 0);
