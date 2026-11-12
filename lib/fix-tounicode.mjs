// Some issues have fonts whose /ToUnicode CMap maps glyphs to U+FFFD
// (e.g. every "х" or all Latin letters), while /Encoding /Differences has the
// correct glyph names (afii10087 = "х"). Dropping the U+FFFD entries makes
// pdf.js fall back to glyph names, which gives the right text.

import zlib from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFRef, decodePDFRawStream } from 'pdf-lib';

const FFFD = /<\s*fffd\s*>/i;

const cleanCMap = (text) => text
  .replace(/(\d+)\s+beginbfchar([\s\S]*?)endbfchar/g, (m, n, body) => {
    const entries = (body.match(/<[0-9A-Fa-f]+>\s*<[0-9A-Fa-f]+>/g) || []).filter(e => !FFFD.test(e.replace(/^<[0-9A-Fa-f]+>/, '')));
    return entries.length ? `${entries.length} beginbfchar\n${entries.join('\n')}\nendbfchar` : '';
  })
  .replace(/(\d+)\s+beginbfrange([\s\S]*?)endbfrange/g, (m, n, body) => {
    const entries = (body.match(/<[0-9A-Fa-f]+>\s*<[0-9A-Fa-f]+>\s*(?:<[0-9A-Fa-f]+>|\[[^\]]*\])/g) || []).filter(e => !/<[0-9A-Fa-f]+>\s*<[0-9A-Fa-f]+>\s*<\s*fffd\s*>/i.test(e));
    return entries.length ? `${entries.length} beginbfrange\n${entries.join('\n')}\nendbfrange` : '';
  });

// returns {data, fixed}: data is original bytes when nothing to fix
export const fixToUnicode = async (bytes) => {
  let doc;
  try {
    doc = await PDFDocument.load(bytes, {ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false});
  } catch {
    return {data: bytes, fixed: 0};
  }
  let fixed = 0;
  const done = new Set();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const tuRef = obj.get(PDFName.of('ToUnicode'));
    if (!(tuRef instanceof PDFRef) || done.has(String(tuRef))) continue;
    done.add(String(tuRef));
    const tu = doc.context.lookup(tuRef);
    if (!(tu instanceof PDFRawStream)) continue;
    let text;
    try {
      text = Buffer.from(decodePDFRawStream(tu).decode()).toString('latin1');
    } catch {
      continue;
    }
    if (!FFFD.test(text)) continue;
    const data = zlib.deflateSync(Buffer.from(cleanCMap(text), 'latin1'));
    const dict = tu.dict.clone(doc.context);
    dict.delete(PDFName.of('DecodeParms'));
    dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
    dict.set(PDFName.of('Length'), doc.context.obj(data.length));
    doc.context.assign(tuRef, PDFRawStream.of(dict, data));
    fixed++;
  }
  if (!fixed) return {data: bytes, fixed};
  const data = await doc.save({useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false});
  return {data, fixed};
};
