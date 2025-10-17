#!/usr/bin/env node

// use pdftotext to convert PDF to text

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const main = async () => {
  // get list of all PDF files in /pdf/ folder using async/await
  const files = await fs.promises.readdir('./pdf/');
  const pdfFiles = files.filter(file => path.extname(file) === '.pdf');

  // create index folder if it doesn't exist using async/await
  await fs.promises.mkdir('./text/', { recursive: true });

  for (const file of pdfFiles) {
    const filePath = path.join('./pdf/', file);
    const indexName = path.basename(filePath, '.pdf') + '.text';
    const indexFilePath = path.join('./text/', indexName);

    process.stdout.write(file);

    try {
      // exec async/await
      await new Promise((resolve, reject) => {
        childProcess.exec(['pdftotext', filePath, indexFilePath].join(' '),
          (err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          }
        );
      });
      console.log(' done');
    } catch (error) {
      console.log(` ERROR: ${error.message}`);
    }
  }
};

main();
