// PDF -> Markdown converter for InDesign-made (tagged) magazine PDFs.
//
// Reading order comes from the PDF structure tree (Document/Art/Sect/P/Span),
// which InDesign writes in story order, so multi-column layouts come out right.
// Untagged PDFs fall back to content-stream order with geometric paragraph split.

import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fixToUnicode } from './fix-tounicode.mjs';

const SOFT_HYPHEN = '\u00ad';
const BLOCK_ROLES = new Set(['P', 'H', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'Lbl', 'LBody', 'TD', 'TH', 'Caption', 'Figure', 'BlockQuote', 'Note', 'TOC', 'TOCI']);
const HEADING_ROLES = {H: 2, H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6};

const fontStyle = (name = '') => {
  const n = name.replace(/^[A-Z]{6}\+/, '');
  return {
    bold: /bold|black|heavy|semibold|demi|extrab/i.test(n),
    italic: /italic|oblique|kursiv/i.test(n),
  };
};

const itemSize = (it) => Math.round(Math.hypot(it.transform[2], it.transform[3]) * 10) / 10 || Math.abs(it.transform[3]);

// ---------------------------------------------------------------------------
// page -> raw blocks
//
// block: {role, page, lines: [{runs: [{str, size, bold, italic}], join}]}
//   join: how this line attaches to previous one:
//     'space' (normal line wrap), 'soft' (soft hyphen, glue), 'break' (forced line break)

// letter-spaced text signature: single letters that are not one-letter words
// ("об ъ е диня е т"), or three single letters in a row
const ODD = '[^\\s\\P{L}вкосуияаВКОСУИЯА]';
const TRACKED_RE = new RegExp(`(?<!\\p{L})${ODD} \\p{L}(?!\\p{L})|(?<!\\p{L})\\p{L} ${ODD}(?!\\p{L})|(?<!\\p{L})\\p{L} \\p{L} \\p{L}(?!\\p{L})`, 'u');

// pdf.js inserts narrow space items for horizontal gaps. In letter-spaced
// (tracked) text these also appear inside words, so such lines are re-segmented
// with the document dictionary later.
const isNarrowSpace = (i) => i.str === ' ' && i.width < itemSize(i) * 0.12;

const runsFromItems = (items, fonts) => {
  const runs = [];
  let prev = null;
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    if (it.str === undefined) continue;
    let str = it.str;
    // tracked text: pdf.js returns "С О Д Е Р Ж А Н И Е"
    if (/^\S(?: \S){2,}$/.test(str)) str = str.replace(/ /g, '');
    const style = fontStyle(fonts[it.fontName]);
    const size = itemSize(it);
    if (prev && str && !/^\s/.test(str) && !/\s$/.test(prev.it.str)) {
      // pdf.js emits its own space items for gaps; only handle wrapped lines
      // and big jumps (e.g. tab stops, table cells)
      const gap = it.transform[4] - (prev.it.transform[4] + prev.it.width);
      const sameLine = Math.abs(it.transform[5] - prev.it.transform[5]) < size * 0.5;
      if (!sameLine || prev.it.hasEOL || gap > size * 1.5) str = ' ' + str;
    }
    if (it.hasEOL && it.str === '') continue; // pdf.js empty EOL marker
    if (str) {
      runs.push({str, size, ...style});
      prev = {it};
    }
  }
  return runs;
};

// same text drawn twice (overprint, fake bold) -> drop item fully covered by an
// earlier item with same baseline and size
const makeOverprintFilter = () => {
  const lines = new Map();
  return (it) => {
    if (!it.str || !it.str.trim() || !it.width) return false;
    const size = itemSize(it);
    const key = `${Math.round(it.transform[5] * 2)}|${Math.round(size * 2)}`;
    const x0 = it.transform[4], x1 = x0 + it.width;
    const ivs = lines.get(key) || [];
    const tol = size * 0.05;
    const covered = ivs.some(iv => x0 >= iv.x0 - tol && x1 <= iv.x1 + tol && iv.str.includes(it.str.trim().slice(0, 3)));
    if (!covered) {
      ivs.push({x0, x1, str: it.str});
      lines.set(key, ivs);
    }
    return covered;
  };
};

const groupByMarkedContent = (items) => {
  const byId = new Map();
  const orphans = []; // text not inside tagged content (and not Artifact)
  const stack = [];
  const isOverprint = makeOverprintFilter();
  for (const it of items) {
    if (it.type === 'beginMarkedContentProps' || it.type === 'beginMarkedContent') {
      stack.push(it);
      continue;
    }
    if (it.type === 'endMarkedContent') {
      stack.pop();
      continue;
    }
    // artifacts = running headers, page numbers; but placed PDFs (ads, inserts)
    // are also marked as artifacts and contain real text
    if (stack.some(m => m.tag === 'Artifact') && !stack.some(m => m.tag === 'PlacedPDF')) continue;
    if (isOverprint(it)) continue;
    const owner = [...stack].reverse().find(m => m.id);
    if (owner) {
      if (!byId.has(owner.id)) byId.set(owner.id, []);
      byId.get(owner.id).push(it);
    } else {
      orphans.push(it);
    }
  }
  return {byId, orphans};
};

const lineMeta = (items, runs, geom) => {
  const narrow = items.some(isNarrowSpace);
  const textItems = items.filter(i => i.str && i.str.trim());
  const it = textItems[0] || items[0];
  const last = textItems[textItems.length - 1] || it;
  const y = it ? it.transform[5] : 0;
  const text = runs.map(r => r.str).join('').replace(/\s+/g, ' ').trim();
  return {
    edge: y < geom.margin || y > geom.height - geom.margin,
    key: text.replace(/\d+/g, '#'),
    // geometry, used to glue segments split inside one visual line
    x0: it ? it.transform[4] : 0,
    y0: y,
    x1: last ? last.transform[4] + last.width : 0,
    y1: last ? last.transform[5] : 0,
    size: it ? itemSize(it) : 0,
    endsWithSpace: /\s$/.test(runs.map(r => r.str).join('')),
    tracked: narrow || TRACKED_RE.test(text),
    letterSpaced: TRACKED_RE.test(text),
  };
};

const blocksFromStructTree = (tree, byId, fonts, pageNum, used, geom) => {
  const blocks = [];
  let cur = null;
  let pendingJoin = 'space';

  const open = (role) => {
    cur = {role, page: pageNum, lines: []};
    blocks.push(cur);
    pendingJoin = 'space';
  };

  const addContent = (id) => {
    const items = byId.get(id);
    if (!items || used.has(id)) return; // some trees reference one MCID several times
    used.add(id);
    const runs = runsFromItems(items, fonts);
    const text = runs.map(r => r.str).join('');
    if (!text.trim()) return;
    if (!cur) open('P');
    cur.lines.push({runs, join: cur.lines.length ? pendingJoin : 'space', ...lineMeta(items, runs, geom)});
    pendingJoin = 'space';
  };

  const walk = (node, inBlock) => {
    if (!node) return;
    if (node.type === 'content') {
      addContent(node.id);
      return;
    }
    if (node.type === 'object' || node.type === 'annotation') return;
    const role = node.role;
    if (inBlock && role === 'Span' && node.alt !== undefined) {
      // InDesign: soft hyphen / forced line break as replacement text
      if (node.alt === SOFT_HYPHEN || node.alt === '') {
        pendingJoin = 'soft';
        (node.children || []).forEach(c => c.type === 'content' && used.add(c.id));
        return;
      }
      if (node.alt === '\n' || node.alt === '\r') {
        pendingJoin = 'break';
        (node.children || []).forEach(c => c.type === 'content' && used.add(c.id));
        return;
      }
    }
    if (!inBlock && BLOCK_ROLES.has(role)) {
      open(role);
      (node.children || []).forEach(c => walk(c, true));
      if (role === 'Figure' && node.alt && !cur.lines.length) {
        cur.lines.push({runs: [{str: node.alt, size: 0, bold: false, italic: false}], join: 'space'});
      }
      cur = null;
      return;
    }
    if (!inBlock && (role === 'Sect' || role === 'Art' || role === 'Div' || role === 'Story')) {
      cur = null; // new frame/story: do not glue to previous block
    }
    (node.children || []).forEach(c => walk(c, inBlock));
  };

  walk(tree, false);
  return blocks.filter(b => b.lines.length);
};

// untagged content: split into lines by hasEOL, paragraphs by vertical gaps
const blocksFromItems = (items, fonts, pageNum, geom) => {
  const lines = [];
  let line = [];
  for (const it of items) {
    if (it.str === undefined) continue;
    if (it.str !== '') line.push(it);
    if (it.hasEOL) {
      if (line.length) lines.push(line);
      line = [];
    }
  }
  if (line.length) lines.push(line);

  const blocks = [];
  let cur = null;
  let prev = null;
  for (const l of lines) {
    const runs = runsFromItems(l, fonts);
    if (!runs.map(r => r.str).join('').trim()) continue;
    const x = l[0].transform[4];
    const y = l[0].transform[5];
    const size = itemSize(l[0]);
    const newPara = !prev ||
      Math.abs(prev.size - size) > 0.6 ||
      prev.y - y > size * 1.9 ||   // vertical gap
      prev.y - y < -size ||        // jumped up: new column / frame
      Math.abs(prev.x - x) > size * 8 ||
      (x - prev.x > size * 0.6 && x - prev.x < size * 3); // first-line indent
    if (newPara) {
      cur = {role: 'P', page: pageNum, lines: []};
      blocks.push(cur);
    }
    cur.lines.push({runs, join: 'space', ...lineMeta(l, runs, geom)});
    prev = {x, y, size};
  }
  return blocks;
};

// remove running headers/footers/page numbers: lines in top/bottom margin
// whose text (digits masked) repeats on many pages
const dropRunningHeaders = (blocks, numPages) => {
  const pagesByKey = new Map();
  for (const b of blocks) for (const l of b.lines) {
    if (!l.edge) continue;
    if (!pagesByKey.has(l.key)) pagesByKey.set(l.key, new Set());
    pagesByKey.get(l.key).add(b.page);
  }
  const min = Math.max(3, numPages * 0.05);
  const isRunning = (l) => l.edge && (/^[#\s]*$/.test(l.key) || (pagesByKey.get(l.key)?.size || 0) >= min);
  // article-level running heads: keep first occurrence; magazine-wide: drop all
  const global = (l) => /^[#\s]*$/.test(l.key) || pagesByKey.get(l.key).size >= numPages * 0.3;
  const seen = new Set();
  for (const b of blocks) b.lines = b.lines.filter(l => {
    if (!isRunning(l)) return true;
    if (global(l) || seen.has(l.key)) return false;
    seen.add(l.key);
    return true;
  });
  return blocks.filter(b => b.lines.length);
};

// ---------------------------------------------------------------------------
// text assembly

const WORD_RE = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;

const plainLine = (line) => line.runs.map(r => r.str).join('').replace(/\s+/g, ' ').trim();

// first pass: build dictionary of words to decide hyphenation of forced breaks
const buildDictionary = (blocks) => {
  const dict = new Map();
  for (const b of blocks) {
    let text = '';
    for (const line of b.lines) {
      if (line.tracked) continue;
      const t = plainLine(line);
      text += line.join === 'soft' ? t : ' ' + t;
    }
    for (const w of text.toLowerCase().match(WORD_RE) || []) {
      dict.set(w, (dict.get(w) || 0) + 1);
    }
  }
  return dict;
};

// re-segment letter-spaced text using dictionary:
// "об ъ е диня е т л е ген д ар ные" -> "объединяет легендарные"
const resegment = (str, dict) => {
  const parts = str.split(/( +)/);
  const tokens = [];
  for (let i = 0; i < parts.length; i += 2) tokens.push({t: parts[i], sp: parts[i + 1] || ''});
  const n = tokens.length;
  const best = new Array(n + 1).fill(-Infinity);
  const from = new Array(n + 1).fill(0);
  best[0] = 0;
  if (!dict.prefixes) {
    // stems of known words, to accept unseen inflections ("пассажир-ы")
    dict.prefixes = new Set();
    for (const w of dict.keys()) for (let l = 4; l <= w.length; l++) dict.prefixes.add(w.slice(0, l));
  }
  const known = (w, stems = true) => {
    const k = w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!k) return 0;
    if (dict.has(k)) return k.length;
    if (!stems) return 0;
    if (k.length >= 6 && /^\p{L}+$/u.test(k) && !/\p{Ll}\p{Lu}/u.test(w) && dict.prefixes.has(k.slice(0, k.length - 3))) return k.length * 0.7; // known stem + ending
    return 0;
  };
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(0, i - 16); j < i; j++) {
      const w = tokens.slice(j, i).map(x => x.t).join('');
      const k = known(w);
      let score;
      const parts = tokens.slice(j, i).map(x => x.t);
      if (i - j === 1) score = k ? k * k : 0;
      else if (!k || /\p{Ll}\p{Lu}/u.test(w)) score = -Infinity;
      else if (!known(w, false) && !(parts.some(t => t.length <= 5 && !known(t, false)) && !parts.some(t => t.length >= 4 && known(t, false)))) score = -Infinity; // stem match: only fragments
      else score = k * k;
      if (best[j] + score > best[i]) {
        best[i] = best[j] + score;
        from[i] = j;
      }
    }
  }
  let words = [];
  for (let i = n; i > 0; i = from[i]) {
    const j = from[i];
    words.push({t: tokens.slice(j, i).map(x => x.t).join(''), sp: tokens[i - 1].sp});
  }
  words.reverse();
  // leftover letter-spaced fragments: "л е ген д ар ные" -> "легендарные"
  const frag = (w) => /^\p{L}{1,3}$/u.test(w.t) && !known(w.t, false);
  const out = [];
  for (let i = 0; i < words.length;) {
    let j = i;
    while (j < words.length && /^\p{L}{1,4}$/u.test(words[j].t)) j++;
    const seq = words.slice(i, j);
    if (seq.length >= 3 && seq.filter(frag).length * 2 >= seq.length && TRACKED_RE.test(seq.map(w => w.t).join(' '))) {
      // include following word ending ("ные")
      out.push({t: seq.map(w => w.t).join(''), sp: seq[seq.length - 1].sp});
      i = j;
    } else {
      out.push(words[i]);
      i++;
    }
  }
  return out.map(w => w.t + w.sp).join('');
};

// fonts with broken ToUnicode give U+FFFD; guess the glyph from dictionary:
// "Аэроприбор\ufffdВос\ufffdод" -> "Аэроприбор-Восход"
const REPL_CANDIDATES = [...'абвгдеёжзийклмнопрстуфхцчшщъыьэюя', '-', ''];
const repairReplacementChars = (str, dict) => {
  if (!str.includes('\ufffd')) return str;
  const cache = dict.replCache || (dict.replCache = new Map());
  return str.replace(/[\p{L}\p{N}\ufffd-]*\ufffd[\p{L}\p{N}\ufffd-]*/gu, (word) => {
    if (cache.has(word)) return cache.get(word);
    const holes = word.split('\ufffd').length - 1;
    // prefer letters over '-' / '' (penalty), then dictionary frequency
    let best = null, bestKey = null, ties = 0;
    const corpus = dict.corpus;
    if (holes <= 3) {
      const upper = /\p{Lu}{2}/u.test(word.replace(/\ufffd/g, ''));
      const rec = (i, acc, penalty) => {
        if (i === word.length) {
          const parts = acc.split('-');
          if (parts.some(x => !x)) return;
          let score = 0;
          for (const x of parts) {
            const k = x.toLowerCase();
            const c = (dict.get(k) || 0) + (corpus?.get(k) || 0);
            if (!c) return;
            score += c;
          }
          const key = [penalty, score];
          if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
            best = acc; bestKey = key; ties = 0;
          } else if (key[0] === bestKey[0] && key[1] === bestKey[1]) ties++;
          return;
        }
        if (word[i] !== '\ufffd') return rec(i + 1, acc + word[i], penalty);
        for (const c of REPL_CANDIDATES) rec(i + 1, acc + (upper ? c.toUpperCase() : c), penalty + (c.length && c !== '-' ? 0 : 1));
      };
      rec(0, '', 0);
    }
    const res = best && !ties ? best : word;
    cache.set(word, res);
    return res;
  });
};

// segments touching on one visual line: glue unless both sides are words
// and the joined form is not ("до" + "сих" stays "до сих", "пасса" + "жиры" glues)
const shouldGlue = (left, right, dict) => {
  const a = (left.match(/(\p{L}+)$/u) || [])[1];
  const b = (right.match(/^(\p{L}+)/u) || [])[1];
  if (!a || !b) return true;
  const joined = (a + b).toLowerCase();
  if (dict.has(joined) || dict.corpus?.has(joined)) return true;
  const known = (w) => dict.has(w.toLowerCase()) || dict.corpus?.has(w.toLowerCase());
  if (/\p{Ll}$/u.test(a) && /^\p{Lu}/u.test(b)) return false; // "словоСлово"
  if (/^\p{Lu}+$/u.test(a) && /^\p{Ll}/u.test(b)) return !known(b); // "СВО" + "и"
  return !(known(a) && known(b));
};

// decide how to glue line ending in "-" with next line
const resolveHyphen = (left, right, dict) => {
  const a = (left.match(/([\p{L}\p{N}-]+)-$/u) || [])[1];
  const b = (right.match(/^([\p{L}\p{N}-]+)/u) || [])[1];
  if (!a || !b) return 'keep';
  if (!/^\p{Ll}/u.test(b)) return 'keep'; // "Северо-" + "Западный"
  const joined = (a + b).toLowerCase();
  const hyph = (a + '-' + b).toLowerCase();
  const jn = dict.get(joined) || 0;
  const hn = dict.get(hyph) || 0;
  if (jn > hn) return 'join';
  if (hn > jn) return 'keep';
  return 'unknown';
};

// glue lines -> list of styled runs with resolved spaces
const blockRuns = (block, dict) => {
  const out = [];
  const push = (str, r) => {
    const last = out[out.length - 1];
    if (last && last.bold === r.bold && last.italic === r.italic && last.size === r.size) {
      // same style
      last.str += str;
    } else {
      out.push({...r, str});
    }
  };
  const text = () => out.map(r => r.str).join('');
  const trimEnd = () => {
    while (out.length && /\s$/.test(out[out.length - 1].str)) {
      out[out.length - 1].str = out[out.length - 1].str.replace(/\s+$/, '');
      if (!out[out.length - 1].str) out.pop();
    }
  };
  const dropLastChar = () => {
    const last = out[out.length - 1];
    last.str = last.str.slice(0, -1);
    if (!last.str) out.pop();
  };

  const glued = (a, b) => a && !a.endsWithSpace &&
    Math.abs(a.y1 - b.y0) < Math.max(a.size, b.size) * 0.3 &&
    Math.abs(b.x0 - a.x1) < Math.max(a.size, b.size) * 0.18;

  // merge letter-spaced segments of one visual line, let resegment() decide spaces
  const lines = [];
  for (const line of block.lines) {
    const a = lines[lines.length - 1];
    if (a && a.tracked && line.tracked && line.join === 'space' &&
        Math.abs(a.y1 - line.y0) < Math.max(a.size, line.size) * 0.3 &&
        line.x0 - a.x1 > -1 && line.x0 - a.x1 < Math.max(a.size, line.size) * 0.5) {
      const gap = line.x0 - a.x1 >= Math.max(a.size, line.size) * 0.05 && !a.endsWithSpace && !/^\s/.test(line.runs[0].str);
      lines[lines.length - 1] = {...a, runs: [...a.runs, ...(gap ? [{...line.runs[0], str: ' '}] : []), ...line.runs], x1: line.x1, y1: line.y1, endsWithSpace: line.endsWithSpace};
    } else {
      lines.push(line);
    }
  }

  lines.forEach((line, i) => {
    const runs = line.runs.map(r => ({...r, str: r.str.replace(/[\s\u00a0]+/g, ' ')}));
    if (line.tracked) {
      // merge same-style runs, then fix spaces inside letter-spaced words
      for (let a = 0; a + 1 < runs.length;) {
        const r = runs[a], q = runs[a + 1];
        if (r.bold === q.bold && r.italic === q.italic && r.size === q.size) {
          r.str += q.str;
          runs.splice(a + 1, 1);
        } else a++;
      }
      for (const r of runs) r.str = resegment(r.str, dict);
    }
    if (!runs.length) return;
    runs[0].str = runs[0].str.replace(/^ +/, '');
    if (i > 0) {
      trimEnd();
      const left = text();
      const right = runs.map(r => r.str).join('');
      if (line.join === 'soft') {
        if (left.endsWith('-')) dropLastChar();
      } else if (left.endsWith('-') && !/\s-$/.test(left)) {
        // hard hyphen at end of line
        const how = resolveHyphen(left, right, dict);
        if (how === 'join' || (how === 'unknown' && line.join === 'break')) dropLastChar();
      } else if (!/^[.,;:!?)\]»]/.test(right) && !(glued(lines[i - 1], line) && shouldGlue(left, right, dict))) {
        push(' ', runs[0]);
      }
    }
    runs.forEach(r => push(r.str, r));
  });
  trimEnd();
  for (const r of out) r.str = repairReplacementChars(r.str, dict);
  for (const r of out) r.str = r.str.replace(/([«„(]) +/g, '$1').replace(/ +([»“)])/g, '$1');
  for (let i = 0; i + 1 < out.length; i++) {
    if (/[«„(] *$/.test(out[i].str)) {
      out[i].str = out[i].str.replace(/ +$/, '');
      out[i + 1].str = out[i + 1].str.replace(/^ +/, '');
    }
    if (/^ *[»“)]/.test(out[i + 1].str)) {
      out[i].str = out[i].str.replace(/ +$/, '');
      out[i + 1].str = out[i + 1].str.replace(/^ +/, '');
    }
  }
  return out.filter(r => r.str);
};

// ---------------------------------------------------------------------------
// markdown rendering

const escapeMd = (s) => s
  .replace(/([\\`*_])/g, '\\$1')
  .replace(/^(#{1,6}\s|>|[-+]\s|\d+\.\s)/, '\\$1');

const charCount = (runs) => runs.reduce((n, r) => n + r.str.trim().length, 0);

const dominant = (runs) => {
  const by = new Map();
  for (const r of runs) {
    const k = `${r.size}|${r.bold}|${r.italic}`;
    by.set(k, (by.get(k) || 0) + r.str.trim().length);
  }
  const [k] = [...by.entries()].sort((a, b) => b[1] - a[1])[0] || ['0|false|false'];
  const [size, bold, italic] = k.split('|');
  return {size: Number(size), bold: bold === 'true', italic: italic === 'true'};
};

const inlineMd = (runs, base) => {
  let s = '';
  for (const r of runs) {
    const m = r.str.match(/^(\s*)(.*?)(\s*)$/s);
    let t = escapeMd(m[2]);
    if (t) {
      const b = r.bold && !base.bold;
      const it = r.italic && !base.italic;
      if (b && it) t = `***${t}***`;
      else if (b) t = `**${t}**`;
      else if (it) t = `*${t}*`;
    }
    s += m[1] + t + m[3];
  }
  // merge adjacent emphasis: "**a** **b**" -> "**a b**"
  return s.replace(/\*\*\*\*/g, '').replace(/\*\*( +)\*\*/g, '$1').replace(/(?<!\*)\*( +)\*(?!\*)/g, '$1').trim();
};

const bodySizeOf = (blocks) => {
  const by = new Map();
  for (const b of blocks) for (const r of b.runs) {
    if (!r.size) continue;
    by.set(r.size, (by.get(r.size) || 0) + r.str.length);
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
};

const isUpper = (s) => /\p{L}/u.test(s) && s === s.toUpperCase();
const endsSentence = (s) => /[.!?…:;»")\]]$/.test(s.trim());

const classify = (block, body) => {
  const text = block.runs.map(r => r.str).join('').trim();
  const st = dominant(block.runs);
  const len = text.length;
  block.text = text;
  block.style = st;
  if (!/\p{L}/u.test(text)) return {kind: 'p'}; // numbers, page refs
  if (HEADING_ROLES[block.role]) return {kind: 'h', level: HEADING_ROLES[block.role]};
  if (block.role === 'Figure') return {kind: 'figure'};
  if (len < 200 && st.size >= body * 1.8) return {kind: 'h', level: 1};
  if (len < 250 && st.size >= body * 1.25) return {kind: 'h', level: 2};
  if (len < 120 && st.bold && st.size >= body * 0.95 && (isUpper(text) || !endsSentence(text))) {
    return {kind: 'h', level: 3};
  }
  if (st.size && st.size < body * 0.95) return {kind: 'small'};
  return {kind: 'p'};
};

// join paragraph continued on next page (or next column frame)
const mergeContinuations = (blocks) => {
  const out = [];
  for (const b of blocks) {
    const prev = [...out].reverse().find(x => x.kind === 'p');
    const last = out[out.length - 1];
    if (b.kind === 'p' && prev && prev.page !== b.page &&
        (last === prev || last.kind !== 'p') &&
        !endsSentence(prev.text) && /^[\p{Ll},;–—)]/u.test(b.text) &&
        Math.abs(prev.style.size - b.style.size) < 0.6 && prev.style.bold === b.style.bold) {
      const glue = prev.text.endsWith('-') ? '' : ' ';
      if (glue === '') prev.runs[prev.runs.length - 1].str = prev.runs[prev.runs.length - 1].str.replace(/-$/, '');
      prev.runs.push({...b.runs[0], str: glue}, ...b.runs);
      prev.text = prev.runs.map(r => r.str).join('');
      continue;
    }
    out.push(b);
  }
  return out;
};

const render = (blocks, opts) => {
  const lines = [];
  let page = 0;
  for (const b of blocks) {
    if (opts.pageMarkers && b.page !== page) {
      // marker placed before first block that starts on a new page
      while (page < b.page) page++;
      lines.push(`<!-- page ${page} -->`);
    }
    if (b.kind === 'h') {
      const t = escapeMd(b.text.replace(/\s+/g, ' '));
      lines.push('#'.repeat(b.level) + ' ' + t);
    } else if (b.kind === 'figure') {
      lines.push(`*[${inlineMd(b.runs, {bold: false, italic: true})}]*`);
    } else if (b.kind === 'small') {
      const t = inlineMd(b.runs, {bold: b.style.bold, italic: true});
      lines.push(b.style.bold ? `***${t}***` : `*${t}*`);
    } else {
      const t = inlineMd(b.runs, b.style);
      lines.push(b.style.bold && b.text.length < 600 ? `**${t}**` : t);
    }
  }
  return lines.join('\n\n') + '\n';
};

// ---------------------------------------------------------------------------

export const pdfToMarkdown = async (src, opts = {}) => {
  opts = {pageMarkers: true, onPage: null, fixFonts: true, ...opts};
  let data = typeof src === 'string' ? new Uint8Array(fs.readFileSync(src)) : src;
  let fixedFonts = 0;
  if (opts.fixFonts) {
    const res = await fixToUnicode(data);
    data = new Uint8Array(res.data);
    fixedFonts = res.fixed;
  }
  const task = getDocument({
    data,
    verbosity: 0,
    fontExtraProperties: true,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const doc = await task.promise;

  let raw = [];
  let tagged = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent({includeMarkedContent: true});
    // operator list makes pdf.js load fonts, so real font names are available
    await page.getOperatorList();
    const fonts = {};
    for (const it of tc.items) {
      if (it.fontName && !(it.fontName in fonts)) {
        try { fonts[it.fontName] = page.commonObjs.get(it.fontName)?.name || ''; } catch { fonts[it.fontName] = ''; }
      }
    }
    const tree = await page.getStructTree().catch(() => null);
    const [, y0, , y1] = page.view;
    const geom = {height: y1 - y0, margin: 50};
    const {byId, orphans} = groupByMarkedContent(tc.items);
    let blocks = [];
    if (tree && byId.size) {
      tagged++;
      const used = new Set();
      blocks = blocksFromStructTree(tree, byId, fonts, p, used, geom);
      // tagged text missing from the tree + untagged text
      const rest = [...byId.entries()].filter(([id]) => !used.has(id)).flatMap(([, v]) => v).concat(orphans);
      blocks.push(...blocksFromItems(rest, fonts, p, geom));
    } else {
      blocks = blocksFromItems(orphans.concat([...byId.values()].flat()), fonts, p, geom);
    }
    raw.push(...blocks);
    page.cleanup();
    if (opts.onPage) opts.onPage(p, doc.numPages);
  }
  const numPages = doc.numPages;
  await task.destroy();

  raw = dropRunningHeaders(raw, numPages);
  const dict = buildDictionary(raw);
  if (opts.corpus) dict.corpus = opts.corpus; // Map word -> count from other documents
  for (const b of raw) b.runs = blockRuns(b, dict);
  raw = raw.filter(b => b.runs.length);
  const body = bodySizeOf(raw);
  for (const b of raw) Object.assign(b, classify(b, body));
  const blocks = mergeContinuations(raw);

  return {
    markdown: render(blocks, opts),
    pages: numPages,
    taggedPages: tagged,
    bodySize: body,
    fixedFonts,
  };
};
