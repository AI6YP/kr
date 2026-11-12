#!/usr/bin/env node

// convert PDF to Markdown using pdf.js (pdfjs-dist)
//
// usage:
//   ./bin/md.js                     convert pdf/*.pdf -> md/*.md (skip existing)
//   ./bin/md.js --force             re-convert all
//   ./bin/md.js pdf/KR_2026_9_10.pdf [...]   convert given files
//   ./bin/md.js --no-pages          omit <!-- page N --> markers
//   ./bin/md.js -j 4                run 4 conversions in parallel

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const main = async () => {
  const {pdfToMarkdown} = await import('../lib/pdf2md.mjs');
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const pageMarkers = !args.includes('--no-pages');
  const jIdx = args.indexOf('-j');
  const jobs = jIdx >= 0 ? Number(args.splice(jIdx, 2)[1]) || 1 : 1;
  let files = args.filter(a => !a.startsWith('--'));
  const explicit = files.length > 0;
  if (!explicit) {
    files = (await fs.promises.readdir('pdf')).filter(f => f.endsWith('.pdf')).sort().map(f => path.join('pdf', f));
  }
  await fs.promises.mkdir('md', {recursive: true});

  if (jobs > 1) {
    const todo = files.filter(f => force || explicit || !fs.existsSync(path.join('md', path.basename(f, '.pdf') + '.md')));
    const flags = args.filter(a => a.startsWith('--')).concat('--force');
    const queue = [...todo];
    const worker = () => new Promise(resolve => {
      const next = () => {
        const file = queue.shift();
        if (!file) return resolve();
        const cp = childProcess.spawn(process.execPath, [__filename, ...flags, file], {stdio: ['ignore', 'pipe', 'inherit']});
        cp.stdout.on('data', d => process.stdout.write(d));
        cp.on('exit', next);
      };
      next();
    });
    await Promise.all(Array.from({length: jobs}, worker));
    return;
  }

  // corpus dictionary from already converted issues: used to repair glyphs of
  // fonts with broken ToUnicode (U+FFFD) and other dictionary heuristics
  let corpus = null;
  const getCorpus = () => {
    if (corpus) return corpus;
    corpus = new Map();
    const mds = fs.existsSync('md') ? fs.readdirSync('md').filter(f => f.endsWith('.md')) : [];
    for (const f of mds) {
      const text = fs.readFileSync(path.join('md', f), 'utf8').toLowerCase();
      for (const w of text.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) || []) {
        corpus.set(w, (corpus.get(w) || 0) + 1);
      }
    }
    for (const [w, c] of corpus) if (c < 3) corpus.delete(w); // drop typos/fragments
    return corpus;
  };

  for (const file of files) {
    const out = path.join('md', path.basename(file, '.pdf') + '.md');
    if (!force && !explicit && fs.existsSync(out)) continue;
    const t0 = Date.now();
    try {
      const res = await pdfToMarkdown(file, {
        pageMarkers,
        corpus: getCorpus(),
        onPage: process.stdout.isTTY && ((p, n) => process.stdout.write(`\r${path.basename(file)} ${p}/${n}`)),
      });
      await fs.promises.writeFile(out, res.markdown);
      const mode = res.taggedPages ? `tagged ${res.taggedPages}/${res.pages}` : 'untagged';
      process.stdout.write(process.stdout.isTTY ? '\r' : '');
      console.log(`${path.basename(file)} -> ${out} ${(res.markdown.length / 1024).toFixed(0)}K, ${mode}, body ${res.bodySize}pt, ${res.fixedFonts ? `fixed ${res.fixedFonts} fonts, ` : ''}${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
    }
  }
};

main();
