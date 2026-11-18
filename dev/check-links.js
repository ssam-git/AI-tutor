/*
 * Do the local links point at files that exist?
 *
 *   node dev/check-links.js
 *
 * Every page links sideways (the back link, the card grid, the cross-links between the two
 * sandboxes). Relative links are what make "clone it, open index.html from a file:// URL,
 * everything works" true - and a link to ./ instead of ./index.html turns a file:// click
 * into a directory listing. So resolve every local href/src in every html file here and
 * complain about anything missing. http(s), mailto, data: and #fragment links are ignored:
 * the pages make no network requests, and external URLs are not this check's problem.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const SKIP = /^(https?:|mailto:|data:|#|javascript:)/;

let bad = 0, checked = 0;
for (const page of pages){
  const src = fs.readFileSync(path.join(root, page), 'utf8');
  const hrefs = [...src.matchAll(/(?:href|src|action)\s*=\s*("([^"]*)"|'([^']*)')/g)]
    .map(m => m[2] !== undefined ? m[2] : m[3]);
  for (const h of hrefs){
    if (!h || SKIP.test(h)) continue;
    checked++;
    const file = decodeURIComponent(h.split('#')[0].split('?')[0]);
    if (!file) continue;                                   // same-page anchor
    const target = path.join(root, file);
    if (fs.existsSync(target)) continue;
    bad++;
    console.log('FAIL ' + page + ' -> ' + h + '  (no such file: ' + path.relative(root, target) + ')');
  }
}
console.log((bad ? 'FAIL ' : 'ok   ') + checked + ' local links across ' + pages.length + ' pages' +
            (bad ? ', ' + bad + ' broken' : ', all resolve'));
process.exitCode = bad ? 1 : 0;
