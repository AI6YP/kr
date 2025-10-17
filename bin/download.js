#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// download all pdfs from https://kr-magazine.ru/archive/

// list of pdf addresses
const pdfs = [
  {url: 'https://www.kr-magazine.ru/upload/iblock/f24/KR1_2_2011_.pdf',     name: 'KR_2011_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/4f2/KR_3_2011_.pdf',      name: 'KR_2011_3.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/8ca/KR_4_2011_.pdf',      name: 'KR_2011_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/b24/KR_5_2011_.pdf',      name: 'KR_2011_5.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/be2/KR_6_2011_.pdf',      name: 'KR_2011_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/b37/KR_7_8_2011_.pdf',    name: 'KR_2011_7_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/9fc/KR_9_10_2011_.pdf',   name: 'KR_2011_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/ca8/KR_11_2011_.pdf',     name: 'KR_2011_11.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/666/KR_12_2011_.pdf',     name: 'KR_2011_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/e71/KR_1_2_2012_.pdf',    name: 'KR_2012_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/b71/KR_3_4_2012_.pdf',    name: 'KR_2012_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/173/KR_5_2012_.pdf',      name: 'KR_2012_5.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/95e/KR_6_2012_.pdf',      name: 'KR_2012_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/180/KR_7_2012_.pdf',      name: 'KR_2012_7.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/bea/KR_8_2012.pdf',       name: 'KR_2012_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/f4d/KR_9_2012_.pdf',      name: 'KR_2012_9.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/b14/KR_10_11_2012_.pdf',  name: 'KR_2012_10_11.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/e61/KR_12_2012_.pdf',     name: 'KR_2012_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/fb2/KR_1_2_2013_.pdf',    name: 'KR_2013_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/5b0/KR_3_2013_.pdf',      name: 'KR_2013_3.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/75d/KR_4_5_2013_.pdf',    name: 'KR_2013_4_5.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/81e/KR_6_2013_.pdf',      name: 'KR_2013_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/682/KR_7_8_2013_.pdf',    name: 'KR_2013_7_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/a15/KR_9_10_2013_.pdf',   name: 'KR_2013_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/d56/KR_11_12_2013_.pdf',  name: 'KR_2013_11_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/434/KR_1_2_2014_n.pdf',   name: 'KR_2014_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/d65/KR_3_4_2014_.pdf',    name: 'KR_2014_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/db7/KR_5_2014_.pdf',      name: 'KR_2014_5.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/7cf/KR_6_2014_.pdf',      name: 'KR_2014_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/f99/KR_7_2014_.pdf',      name: 'KR_2014_7.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/c21/KR_8_2014_.pdf',      name: 'KR_2014_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/00d/KR_9_10_2014_.pdf',   name: 'KR_2014_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/1ab/KR_11_2014_.pdf',     name: 'KR_2014_11.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/769/KR_12_2014_.pdf',     name: 'KR_2014_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/5d2/KR_1_2_2015_.pdf',    name: 'KR_2015_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/8c8/KR_3_2015_.pdf',      name: 'KR_2015_3.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/909/KR_4_5_2015_.pdf',    name: 'KR_2015_4_5.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/2af/KR_6_2015_.pdf',      name: 'KR_2015_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/b98/KR_7_8_2015_.pdf',    name: 'KR_2015_7_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/d8d/KR-9_10_2015_.pdf',   name: 'KR_2015_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/4cc/KR_11_12_2015_.pdf',  name: 'KR_2015_11_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/30d/KR_1_2_2016_.pdf',    name: 'KR_2016_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/edf/KR_3_4_2016_.pdf',    name: 'KR_2016_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/f0b/KR_5_2016_.pdf',      name: 'KR_2016_5.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/ac6/KR_6_2016_.pdf',      name: 'KR_2016_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/d70/KR-7_8_2016_.pdf',    name: 'KR_2016_7_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/41b/KR_9_10_2016_.pdf',   name: 'KR_2016_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/746/KR_11_12_2016_.pdf',  name: 'KR_2016_11_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/f95/KR-1_2_2017_.pdf',    name: 'KR_2017_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/9e6/KR_3_4_2017_.pdf',    name: 'KR_2017_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/551/KR_5_2017_.pdf',      name: 'KR_2017_5.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/1bb/KR_6_7_2017_.pdf',    name: 'KR_2017_6_7.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/a6b/KR_8_2017_.pdf',      name: 'KR_2017_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/cdd/KR_9_10_2017_.pdf',   name: 'KR_2017_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/cf8/KR_11_12_2017_.pdf',  name: 'KR_2017_11_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/e81/KR_1_2_2018_.pdf',    name: 'KR_2018_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/45d/KR_3_4_2018_.pdf',    name: 'KR_2018_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/ba2/KR_5_6_2018_.pdf',    name: 'KR_2018_5_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/2e2/KR-7_8_2018_.pdf',    name: 'KR_2018_7_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/693/KR-9_10_2018_.pdf',   name: 'KR_2018_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/920/KR_11_12_2018_.pdf',  name: 'KR_2018_11_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/a33/KR_1_2_2019_.pdf',    name: 'KR_2019_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/e2e/KR-3_4_2019_.pdf',    name: 'KR_2019_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/f79/KR_-5_6_2019_.pdf',   name: 'KR_2019_5_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/2b6/KR-7_8_2019_.pdf',    name: 'KR_2019_7_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/d42/KR-9_10_2019_.pdf',   name: 'KR_2019_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/1ed/KR_11_12_2019_.pdf',  name: 'KR_2019_11_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/ad2/KR-1_2_2020_.pdf',    name: 'KR_2020_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/211/KR_3_4_2020_.pdf',    name: 'KR_2020_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/a01/KR_5_6_2020_.pdf',    name: 'KR_2020_5_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/7be/KR-7_8_2020_.pdf',    name: 'KR_2020_7_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/9a5/KR-9_10_2020_n.pdf',  name: 'KR_2020_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/65e/KR-11_12_2020_.pdf',  name: 'KR_2020_11_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/bac/KR_1_2_2021_.pdf',    name: 'KR_2021_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/d5d/KR-3_4_2021_.pdf',    name: 'KR_2021_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/b34/7gouopsokzi0t5jl1fgbt220agjsu9ae/KR-5_6_2021_.pdf',               name: 'KR_2021_5_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/c92/t4mc8k73zgmff5uk5atmue2q0k3mwwjk/KR_7_8_2021_.pdf',               name: 'KR_2021_7_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/c83/ftf48mp8qjp0wtsjyzwxmbayxgcomgm3/KR_9_10_2021_Aviaprom.pdf',      name: 'KR_2021_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/969/kviawfzahal1nqaeb7q6uety9vcmjw90/KR-11_12_2021_OrVD.pdf',         name: 'KR_2021_11_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/1bc/bva77sn8ukrw3insqe4qnjxm1ag5ror5/KR-1_2_2022_b.pdf',              name: 'KR_2022_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/637/lybse9rpmt80oh1xnhpw8vx1oudzxc6w/KR_3_4_2022_OKB-YAkovleva.pdf',  name: 'KR_2022_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/cc4/nnyoo6f9qc23tuai1lc6m4cgd01sabtu/KR-_5_6_22_Fedotov.pdf',         name: 'KR_2022_5_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/895/q2uizlcxl6foqg9hjd0c634bwdhdti8z/KR-7_8_2022_.pdf',               name: 'KR_2022_7_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/e51/5aifyn36qu2ib19w2vbaqwx8xpb4ws5y/KR_9_10_2022_n1.pdf',            name: 'KR_2022_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/a73/efnpubwt29veywfvddruevg9c6u09096/KR-11_12_2022_.pdf',             name: 'KR_2022_11_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/252/7xvol3szqaexfn8ebnmus6h2fedokq5r/KR-1_2_2023_n.pdf',              name: 'KR_2023_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/b0f/28dbbhoeux9256vr263g9a5c4kneq4pv/KR-3_4_2023_sayt.pdf',           name: 'KR_2023_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/f1c/g3zz9xmlzg4qlftvt9gmbpx22rgf4ipv/KR-5_6_2023_.pdf',               name: 'KR_2023_5_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/9db/gyp9md3cg2jk7mw2dwnk5a22b87h20to/KR-7_8_2023_.pdf',               name: 'KR_2023_7_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/114/nyqp1klimd8fw9vtm812k1pchx6tn59r/KR-9_10_2023_-ODK.pdf',          name: 'KR_2023_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/93b/1nndcu6qy76kehko1g9taygjmw4ambhq/KR-11_12_2023_n.pdf',            name: 'KR_2023_11_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/86b/kh2czp5fbuvj8mp0zoflv6m8gapd78xf/KR_1_2024_.pdf',                 name: 'KR_2024_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/746/9j2ia9lfysyqzj47xwosmrwnsv1gbja1/KR-3_4_2024_-Fedosov.pdf',       name: 'KR_2024_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/20d/ptonf16w9ujxulsfbhmgbbku7p12ua5g/KR_5_6_2024_n.pdf',              name: 'KR_2024_5_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/08c/ibmbnw354o7u5vcvnekfu1n29y1dd8se/KR_7_8_2024_.pdf',               name: 'KR_2024_7_8.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/509/uihn6i48cxnia90ebw719oai18ekm8z8/KR-9_10_2024_n.pdf',             name: 'KR_2024_9_10.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/43c/t2728zwvp38ullu1hc9p0t65si1oczpo/KR-11_12_24_.pdf',               name: 'KR_2024_11_12.pdf'},

  {url: 'https://www.kr-magazine.ru/upload/iblock/d4f/ftk820ch5b60pxqxzknr5gwpysb0rske/KR_1_2_2025_n.pdf',              name: 'KR_2025_1_2.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/879/2qbc7heo814bgqurfeycctk3xo1kfk3l/KR_3_4_2025_.pdf',               name: 'KR_2025_3_4.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/9cc/zgirwb0pndm0fzzp857im9nqn1x2v7za/KR-5_6_2025_-_1_.pdf',           name: 'KR_2025_5_6.pdf'},
  {url: 'https://www.kr-magazine.ru/upload/iblock/60a/ut3r3b0afea6wr2tzr5l512gbdqkvqq1/KR-7_8_2025_-_1_.pdf',           name: 'KR_2025_7_8.pdf'}
];

const main = async () => {
  await fs.promises.mkdir('pdf', { recursive: true });
  for (const row of pdfs) {
    const filename = path.basename(row.name);
    process.stdout.write('Downloading ' + filename);
    const req = await fetch(row.url);
    const buffer = await req.arrayBuffer();
    await fs.promises.writeFile(`pdf/${filename}`, Buffer.from(buffer));
    console.log(' size: ' + buffer.byteLength.toLocaleString());
  }
};

main();
