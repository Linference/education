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
    const found = new RegExp('(?:^|[^A-Za-z])' + labels[key] + '\\s*[=＝]\\s*([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))(?![\\d.])', 'i').exec(normalized);
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
  if (sections.length > 300) throw new Error('章节过多，请拆分资料后再学习。');
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
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('请选择不超过 32 MB 的资料文件。');
  let sections, totalPages, origin = 'file';
  if (['.md', '.markdown', '.txt'].includes(ext)) {
    if (draftText !== undefined && typeof draftText !== 'string') throw new Error('资料草稿格式无效。');
    const text = draftText ?? fs.readFileSync(filePath, 'utf8');
    if (text.length > 1_000_000) throw new Error('文字超过 100 万字，请拆分后学习。');
    origin = draftText !== undefined && draftText !== fs.readFileSync(filePath, 'utf8') ? 'draft' : 'file';
    sections = sectionsFromText(text, name);
  } else if (ext === '.docx') {
    const result = await require('mammoth').extractRawText({ path: filePath });
    if (result.value.length > 1_000_000) throw new Error('文档文字太长，请按章节拆分。');
    sections = sectionsFromText(result.value, name);
  } else if (ext === '.pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loader = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(filePath)), isEvalSupported: false, useSystemFonts: true });
    const doc = await loader.promise;
    try {
      totalPages = doc.numPages;
      const end = pageEnd === undefined ? Math.min(totalPages, pageStart + 19) : pageEnd;
      if (!Number.isInteger(pageStart) || !Number.isInteger(end) || pageStart < 1 || end < pageStart || end > totalPages || end - pageStart >= 40) throw new Error('PDF 每次读取最多 40 页，请检查起止页码。');
      sections = [];
      for (let number = pageStart; number <= end; number++) {
        const page = await doc.getPage(number), content = await page.getTextContent();
        let text = '', lastY;
        for (const item of content.items) {
          if (!('str' in item)) continue;
          if (lastY !== undefined && Math.abs(lastY - item.transform[5]) > 3) text += '\n';
          text += item.str + (item.hasEOL ? '\n' : ' '); lastY = item.hasEOL ? undefined : item.transform[5];
        }
        for (const section of sectionsFromText(text, name)) sections.push({ ...section, section: '第 ' + number + ' 页', page: number });
        page.cleanup();
      }
    } finally { await doc.destroy(); }
  } else throw new Error('学习资料支持 Markdown、TXT、DOCX 和带文字层的 PDF；其他格式请先转换。');
  if (!sections.length) throw new Error('没有提取到文字。扫描 PDF 请先进行 OCR。');
  return { sources: sections.map(s => makeSource(s, { filePath, name, origin })), totalPages,
    warning: ext === '.docx' ? '引用使用 Word 提取文字；公式对象与图片可能无法提取，请核对原文。' : ext === '.pdf' ? '按 PDF 页码引用文字层；公式和阅读顺序可能有损，请核对原页。' : '' };
}
function excerptSource(source, text) {
  if (typeof text !== 'string' || text.trim().length < 3 || text.length > 7000 || !source.text.includes(text.trim())) throw new Error('请选择当前章节中 3–7000 字的原文。');
  return { ...makeSource({ section: source.section + ' · 选段', text: text.trim(), startLine: source.startLine, endLine: source.endLine, page: source.page }, { filePath: source.path, name: source.name, origin: source.origin }), parentId: source.id };
}
function studyActivity(source, mode, focus = '') {
  if (!['practice', 'detective', 'transfer'].includes(mode)) throw new Error('学习任务类型无效。');
  const emphasis = String(focus).trim().slice(0, 1800);
  const definitions = {
    practice: ['用自己的话解释', '解释本段的核心概念，列出条件，再举一个例子。'],
    detective: ['用反例检查解释', '写出一个容易误解的说法，找出遗漏的条件，用原文或反例修正它。'],
    transfer: ['换个情境再应用', '设计一个与原文不同的新情境，说明哪些条件保留、哪些条件改变，并逐步解释能否应用本段概念。'],
  };
  const [title, instruction] = definitions[mode];
  return { id: 'study:' + hash(source.id + mode + emphasis), mode, concept: source.concept, title: source.section + ' · ' + title,
    prompt: instruction + (emphasis ? '\n本次改进重点：' + emphasis : '') + '\n原文：\n' + source.text,
    options: [], grading: 'self', answer: '核对原文：\n' + source.text,
    explanation: '这是基于当前资料的开放探究任务。请核对概念、条件和推理；自评不会计入可核验的独立通过。',
    hint: '把原文中的定义、条件和例子分开，再检查自己的回答是否有对应依据。',
    source: source.name + ' · ' + source.section, sourceRef: source, focus: emphasis };
}
module.exports = { detectLabs, extractParameters, sectionsFromText, makeSource, readMaterial, excerptSource, studyActivity };
