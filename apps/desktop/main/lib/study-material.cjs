const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 24);
const DEFINITIONS = [
  { kind: 'quadratic', concept: '二次函数', re: /二次函数|抛物线|quadratic|parabola|(?:y|f\(x\))\s*=.{0,40}x(?:\s*\^\s*2|²)/i },
  { kind: 'force', concept: '牛顿第二定律', re: /牛顿第二定律|newton.{0,15}second|F\s*(?:合|net)?\s*=\s*m\s*a|加速度.{0,40}(?:合力|质量)|(?:合力|质量).{0,40}加速度/i },
  { kind: 'probability', concept: '独立事件', re: /独立(?:事件|试验|重复)|independent\s+(?:event|trial|attempt)|至少(?:成功|中奖|出现)一次/i },
];
function detectLabs(text) { return DEFINITIONS.filter(d => d.re.test(text)).map(({ kind, concept }) => ({ kind, concept })); }
function extractParameters(kind, text) {
  const result = {}, normalized = text.normalize('NFKC').replace(/−/g, '-');
  const ranges = {
    quadratic: { a: [-3, 3], h: [-4, 4], k: [-4, 4], x: [-4, 4] },
    force: { force: [0, 80], mass: [1, 10], friction: [0, 0.6] },
    probability: { p: [0.1, 0.9], n: [1, 5] },
  };
  const labels = { a: 'a', h: 'h', k: 'k', x: 'x', force: '(?:F|拉力)', mass: '(?:m|质量)', friction: '(?:μ|摩擦系数)', p: 'p', n: 'n' };
  for (const [key, [min, max]] of Object.entries(ranges[kind] || {})) {
    // A sentence-ending period is punctuation; another decimal component or
    // an unsupported exponent must not be truncated into a plausible value.
    const found = new RegExp('(?:^|[^A-Za-z])' + labels[key] + '\\s*[=＝]\\s*([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))(?!\\d|\\.\\d|\\.{2,}\\d|[eE][+-]?\\d)', 'i').exec(normalized);
    if (!found) continue;
    const value = Number(found[1]);
    if (value >= min && value <= max && (key !== 'n' || Number.isInteger(value))) result[key] = value;
  }
  return result;
}
function sectionsFromText(text, name) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'), sections = [];
  let title = name.replace(/\.[^.]+$/, ''), start = 0, buffer = [], length = 0;
  const flush = end => {
    const content = buffer.join('\n').trim();
    if (content) sections.push({ section: title, text: content, startLine: start + 1, endLine: end });
    buffer = []; length = 0;
  };
  lines.forEach((line, i) => {
    const heading = /^#{1,6}\s+(.+)/.exec(line);
    if (heading || length + line.length > 7000) { flush(i); start = i; if (heading) title = heading[1].trim(); }
    // A single very long line is also bounded, with a truthful line locator.
    for (let offset = 0; offset < Math.max(1, line.length); offset += 7000) {
      const part = line.slice(offset, offset + 7000);
      if (length + part.length > 7000) { flush(i + 1); start = i; }
      buffer.push(part); length += part.length + 1;
    }
  });
  flush(lines.length);
  if (sections.length > 300) throw new Error('Too many sections; split the material before studying.');
  return sections;
}
function makeSource(section, { filePath, name, origin = 'file' }) {
  const labs = detectLabs(section.section + '\n' + section.text);
  return { ...section, id: hash(JSON.stringify({filePath,origin,section:section.section,text:section.text,startLine:section.startLine,endLine:section.endLine,page:section.page??null})), path: filePath, name, origin,
    concept: labs[0]?.concept || section.section.slice(0, 100), labs: labs.map(l => ({ ...l, parameters: extractParameters(l.kind, section.text) })) };
}
async function readMaterial({ filePath, draftText, pageStart = 1, pageEnd }) {
  const name = path.basename(filePath), ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('Please choose a material file no larger than 32 MB.');
  let sections, totalPages, origin = 'file';
  if (['.md', '.markdown', '.txt'].includes(ext)) {
    if (draftText !== undefined && typeof draftText !== 'string') throw new Error('Invalid material draft format.');
    const text = draftText ?? fs.readFileSync(filePath, 'utf8');
    if (text.length > 1_000_000) throw new Error('The text exceeds 1,000,000 characters; split it before studying.');
    origin = draftText !== undefined && draftText !== fs.readFileSync(filePath, 'utf8') ? 'draft' : 'file';
    sections = sectionsFromText(text, name);
  } else if (ext === '.docx') {
    const result = await require('mammoth').extractRawText({ path: filePath });
    if (result.value.length > 1_000_000) throw new Error('The document text is too long; split it by section.');
    sections = sectionsFromText(result.value, name);
  } else if (ext === '.pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loader = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(filePath)), isEvalSupported: false, useSystemFonts: true });
    const doc = await loader.promise;
    try {
      totalPages = doc.numPages;
      const end = pageEnd === undefined ? Math.min(totalPages, pageStart + 19) : pageEnd;
      if (!Number.isInteger(pageStart) || !Number.isInteger(end) || pageStart < 1 || end < pageStart || end > totalPages || end - pageStart >= 40) throw new Error('PDF reads are limited to 40 pages at a time; check the start and end pages.');
      sections = [];
      for (let number = pageStart; number <= end; number++) {
        const page = await doc.getPage(number), content = await page.getTextContent();
        let text = '', lastY;
        for (const item of content.items) {
          if (!('str' in item)) continue;
          if (lastY !== undefined && Math.abs(lastY - item.transform[5]) > 3) text += '\n';
          text += item.str + (item.hasEOL ? '\n' : ' '); lastY = item.hasEOL ? undefined : item.transform[5];
        }
        for (const section of sectionsFromText(text, name)) sections.push({ ...section, section: 'Page ' + number, page: number });
        page.cleanup();
      }
    } finally { await doc.destroy(); }
  } else throw new Error('Study materials support Markdown, TXT, DOCX, and text-layer PDF; convert other formats first.');
  if (!sections.length) throw new Error('No text was extracted. Run OCR first for scanned PDFs.');
  return { sources: sections.map(s => makeSource(s, { filePath, name, origin })), totalPages,
    warning: ext === '.docx' ? 'Citations use text extracted from Word; equation objects and images may not be extracted, so check against the original.' : ext === '.pdf' ? 'Citations follow the text layer of the PDF page; equations and reading order may be distorted, so check the original page.' : '' };
}
function excerptSource(source, text) {
  if (typeof text !== 'string' || text.trim().length < 3 || text.length > 7000 || !source.text.includes(text.trim())) throw new Error('Please select 3–7000 characters of the original text from the current section.');
  return { ...makeSource({ section: source.section + ' · Selection', text: text.trim(), startLine: source.startLine, endLine: source.endLine, page: source.page }, { filePath: source.path, name: source.name, origin: source.origin }), parentId: source.id };
}
function studyActivity(source, mode, focus = '') {
  if (!['practice', 'detective', 'transfer'].includes(mode)) throw new Error('Invalid study task type.');
  const emphasis = String(focus).trim().slice(0, 1800);
  const definitions = {
    practice: ['Explain in your own words', '解释本段的核心概念，列出条件，再举一个例子。'],
    detective: ['Check the explanation with a counterexample', '写出一个容易误解的说法，找出遗漏的条件，用原文或反例修正它。'],
    transfer: ['Apply it in a new context', '设计一个与原文不同的新情境，说明哪些条件保留、哪些条件改变，并逐步解释能否应用本段概念。'],
  };
  const [title, instruction] = definitions[mode];
  return { id: 'study:' + hash(source.id + mode + emphasis), mode, concept: source.concept, title: source.section + ' · ' + title,
    prompt: instruction + (emphasis ? '\n本次改进重点：' + emphasis : '') + '\n原文：\n' + source.text,
    options: [], grading: 'self', answer: 'Check against the original:\n' + source.text,
    explanation: 'This is an open inquiry task based on the current material. Check the concepts, conditions, and reasoning; self-assessment does not count as verifiable independent completion.',
    hint: 'Separate the definitions, conditions, and examples in the original, then check whether your answer is supported by them.',
    source: source.name + ' · ' + source.section, sourceRef: source, focus: emphasis };
}
module.exports = { detectLabs, extractParameters, sectionsFromText, makeSource, readMaterial, excerptSource, studyActivity };
