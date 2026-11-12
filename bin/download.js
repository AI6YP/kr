#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// download all pdfs from https://kr-magazine.ru/archive/

const pdfs = require('../lib/pdfs.json');

const main = async () => {
  await fs.promises.mkdir('pdf', { recursive: true });
  for (const row of pdfs) {
    const filename = path.basename(row.name);
    if (fs.existsSync(`pdf/${filename}`)) {
      continue;
    }
    process.stdout.write('Downloading ' + filename);
    const req = await fetch(row.url);
    if (!req.ok) {
      console.log(' ERROR: HTTP ' + req.status);
      continue;
    }
    const buffer = await req.arrayBuffer();
    await fs.promises.writeFile(`pdf/${filename}`, Buffer.from(buffer));
    console.log(' size: ' + buffer.byteLength.toLocaleString());
  }
};

main();
