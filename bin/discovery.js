#!/usr/bin/env node

// discover new issues on https://www.kr-magazine.ru/archive/
//
// usage:
//   ./bin/discovery.js            scan years >= latest known year, print new issues
//   ./bin/discovery.js --all      scan all years >= earliest known year
//   ./bin/discovery.js --write    also append new issues to lib/pdfs.json

const fs = require('fs');
const path = require('path');

const BASE = 'https://www.kr-magazine.ru';
const LIST = path.join(__dirname, '..', 'lib', 'pdfs.json');

const args = process.argv.slice(2);
const flagAll = args.includes('--all');
const flagWrite = args.includes('--write');

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  return res.text();
};

const uniq = (arr) => [...new Set(arr)];

const yearOf = (name) => Number((name.match(/^KR_(\d{4})/) || [])[1]);

// KR_2026_9_10.pdf -> [2026, 9, 10]
const sortKey = (name) => (name.match(/\d+/g) || []).map(Number);

const cmp = (a, b) => {
  const ka = sortKey(a.name);
  const kb = sortKey(b.name);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const d = (ka[i] || 0) - (kb[i] || 0);
    if (d) return d;
  }
  return 0;
};

// issue page slug, e.g.:
//   krylya-rodiny-9-10-za-2026-god.html, krylya-rodiny-5-6-za-2019-g.html,
//   krylya-rodiny-1-2-2019.html, kr-1-2-2011.html
const nameFromPage = (page) => {
  const m = page.match(/-(\d{1,2}(?:-\d{1,2})*)-(?:za-)?(\d{4})(?:-god|-g)?\.html$/);
  return m && `KR_${m[2]}_${m[1].replace(/-/g, '_')}.pdf`;
};

// PDF file name, e.g.: KR-3_4_2019_.pdf, KR-9-10(2026)chuyko.pdf
const nameFromPdf = (url) => {
  const base = path.basename(url).replace(/[^0-9]+/g, '_');
  const m = base.match(/_(\d{1,2}(?:_\d{1,2})*)_(\d{4})_/);
  return m && `KR_${m[2]}_${m[1]}.pdf`;
};

const writeList = (rows) => {
  fs.writeFileSync(LIST, '[\n' + rows.map(r => '  ' + JSON.stringify(r)).join(',\n') + '\n]\n');
};

const main = async () => {
  const known = JSON.parse(fs.readFileSync(LIST, 'utf8'));
  const knownUrls = new Set(known.map(r => r.url));
  const knownNames = new Set(known.map(r => r.name));
  const years = known.map(r => yearOf(r.name)).filter(Boolean);
  const fromYear = flagAll ? Math.min(...years) : Math.max(...years);

  const archive = await get(BASE + '/archive/');
  // year folders: /archive/2026/, sometimes /archive/2024-g/
  const folders = new Map();
  for (const m of archive.matchAll(/href="\/archive\/((\d{4})[^"/]*)\/"/g)) {
    const year = Number(m[2]);
    if (year >= fromYear) {
      folders.set(m[1], year);
    }
  }
  // index may lag behind, so also probe plain /archive/YYYY/ up to current year
  const listed = new Set(folders.values());
  for (let y = fromYear; y <= new Date().getFullYear(); y++) {
    if (!listed.has(y)) {
      folders.set(String(y), y);
    }
  }
  const dirs = [...folders.keys()].sort();

  console.log(`Scanning: ${dirs.join(', ')}`);

  const found = [];
  for (const dir of dirs) {
    let yearPage;
    try {
      yearPage = await get(`${BASE}/archive/${dir}/`);
    } catch (err) {
      console.log(`  WARN: ${err.message}`);
      continue;
    }
    const issuePages = uniq([...yearPage.matchAll(new RegExp(`href="(/archive/${dir}/[^"]+\\.html)"`, 'g'))].map(m => m[1]));

    for (const issuePage of issuePages) {
      const html = await get(BASE + issuePage);
      const pdfs = uniq([...html.matchAll(/["'](\/upload\/[^"']+\.pdf)["']/gi)].map(x => x[1]));
      if (pdfs.length === 0) {
        console.log(`  WARN: no PDF on ${BASE}${issuePage}`);
        continue;
      }
      if (pdfs.length > 1) {
        console.log(`  WARN: ${pdfs.length} PDFs on ${BASE}${issuePage}, using first`);
      }
      const url = BASE + pdfs[0];

      if (knownUrls.has(url)) {
        continue;
      }
      const name = nameFromPage(issuePage) || nameFromPdf(url);
      if (!name) {
        console.log(`  WARN: can't parse issue number: ${BASE}${issuePage}  ${url}`);
        continue;
      }
      if (knownNames.has(name)) {
        console.log(`  WARN: ${name} known with different URL: ${url}`);
        continue;
      }
      found.push({url, name});
      console.log(`  NEW: ${name}  ${url}`);
    }
  }

  if (found.length === 0) {
    console.log('No new issues.');
    return;
  }

  if (flagWrite) {
    writeList([...known, ...found].sort(cmp));
    console.log(`Added ${found.length} issue(s) to ${path.relative(process.cwd(), LIST)}. Run ./bin/download.js`);
  } else {
    console.log(`Found ${found.length} new issue(s). Run with --write to add them to lib/pdfs.json`);
  }
};

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
