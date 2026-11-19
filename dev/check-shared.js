/*
 * Parts of these tutorials are copied into every page so each one stays a single file you
 * can save and open anywhere. Copies are only useful if they behave the same, so this check
 * compares every marked block -  /* ==== ENGINE START ==== *\/  ...  /* ==== ENGINE END ==== *\/
 * and  /* ==== SPLIT START ==== *\/  ...  /* ==== SPLIT END ==== *\/  - across the pages.
 * Fix a bug once, in one file, then copy the whole block over; this script fails if the
 * copies have drifted. The one allowed difference is the per-page prefix line, e.g.
 * const PAGE = 'api' vs const PAGE = 'mcp'.
 *
 *   node dev/check-shared.js
 *   node dev/check-shared.js api-learning.html mcp-learning.html
 */
const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : ['api-learning.html', 'mcp-learning.html'];

/* pull out every marked block, keyed by its name */
const blocks = new Map();
for (const f of files){
  const p = path.join(__dirname, '..', f);
  const src = fs.readFileSync(p, 'utf8');
  const found = [...src.matchAll(/\/\* ==== ([A-Z]+) START ==== \*\/([\s\S]*?)\/\* ==== \1 END ==== \*\//g)];
  if (!found.length){ console.log('FAIL ' + f + ': no marked blocks at all'); process.exitCode = 1; continue; }
  for (const m of found){
    const key = m[1];
    const body = m[2].replace(/^\s*const PAGE = '[a-z]+';.*$/gm, "const PAGE = '<page>';");
    if (!blocks.has(key)) blocks.set(key, new Map());
    blocks.get(key).set(f, body);
  }
  console.log('     ' + f + ': ' + found.map(m => m[1] + ' (' + m[2].split('\n').length + ' lines)').join(', '));
}

let bad = 0;
for (const [name, per] of blocks){
  const names = [...per.keys()];
  const [first, ...rest] = names;
  if (rest.length !== names.length - 1) { console.log('FAIL ' + name + ': found in ' + names.join(', ')); bad++; continue; }
  for (const f of rest){
    const x = per.get(first), y = per.get(f);
    if (x === y){ console.log('ok   ' + name + ': ' + f + ' matches ' + first + ' (' + x.split('\n').length + ' lines)'); continue; }
    bad++;
    console.log('FAIL ' + name + ': ' + f + ' differs from ' + first);
    const xl = x.split('\n'), yl = y.split('\n');
    for (let i = 0; i < Math.max(xl.length, yl.length); i++)
      if (xl[i] !== yl[i]) console.log('       line ' + (i + 1) + '\n         ' + first + ': ' + xl[i] + '\n         ' + f + ': ' + yl[i]);
  }
}
console.log(bad ? 'shared blocks have drifted - copy the whole block from one file to the other'
                : 'shared blocks in sync across ' + files.length + ' pages');
process.exitCode = bad ? 1 : 0;
