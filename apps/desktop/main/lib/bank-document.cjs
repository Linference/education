const path = require('node:path');
const { parseQuestionsFromMarkdown } = require('./bank-md.cjs');
const { TYPE_ALIAS } = require('./bank-md.cjs');
function normalizeQuestions(questions) {
  return questions.map(q => {
    if (!q || typeof q !== 'object') throw new Error('A question must be an object, not plain text or an array');
    return { type: TYPE_ALIAS[q.type] || q.type || 'answer', stem: String(q.stem || q.question || q['题干'] || '').trim(),
      options: Array.isArray(q.options) ? q.options.map((o,i) => typeof o === 'string' ? { label:String.fromCharCode(65+i),text:o } : {label:String(o.label || String.fromCharCode(65+i)),text:String(o.text || '')}) : [],
      answer:String(q.answer ?? q['答案'] ?? ''), solution:String(q.solution || q.explanation || ''),
      kps:Array.isArray(q.kps) ? q.kps.map(String) : String(q.kps || '').split(/[,，、]/).filter(Boolean),
      difficulty:Math.round(Math.max(1,Math.min(5,Number(q.difficulty)||3))),source:String(q.source || ''),subject:String(q.subject || ''),year:Number.isInteger(q.year)?q.year:null };
  });
}
async function parseDocument({ name, bytes, text }) {
  const ext = path.extname(String(name || '')).toLowerCase();
  let content = text;
  const buffer = bytes ? Buffer.from(bytes) : null;
  if (buffer && buffer.length > 32 * 1024 * 1024) throw new Error('The file exceeds 32 MB; split it before importing');
  if (ext === '.docx') {
    if (!buffer) throw new Error('No Word file received');
    const r = await require('mammoth').extractRawText({ buffer }); content = r.value;
  } else if (ext === '.pdf') {
    if (!buffer) throw new Error('No PDF file received');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false });
    const doc = await loading.promise;
    try {
      if (doc.numPages > 80) throw new Error('The PDF exceeds 80 pages; save the question pages you need separately and import that');
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i), data = await page.getTextContent();
        const lines = []; let line = '', previousY = null;
        for (const item of data.items) {
          if (!('str' in item)) continue;
          const y = item.transform[5];
          if (previousY !== null && Math.abs(y - previousY) > 3 && line) { lines.push(line); line = ''; }
          line += (line ? ' ' : '') + item.str; previousY = y;
          if (item.hasEOL) { lines.push(line); line = ''; previousY = null; }
        }
        if (line) lines.push(line); pages.push(lines.join('\n')); page.cleanup();
      }
      content = pages.join('\n\n');
      if (content.replace(/\s/g,'').length < 20) throw new Error('This is a scanned or image-only PDF with no extractable text. Convert it to editable text or Markdown with OCR before importing; images cannot be used as questions directly.');
    } finally { await doc.destroy(); }
  } else if (ext === '.json') {
    const parsed = JSON.parse(content ?? buffer?.toString('utf8') ?? '');
    const questions = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(questions)) throw new Error('JSON must be an array of questions, or an object containing a questions array');
    return { ok: true, questions:normalizeQuestions(questions), warnings: [], count: questions.length, text: '' };
  } else if (!['.md','.markdown','.txt'].includes(ext)) throw new Error('Supports Markdown, TXT, DOCX, text-layer PDF, and JSON; save legacy DOC files as DOCX first.');
  if (typeof content !== 'string') content = buffer ? new TextDecoder(buffer[0]===255 && buffer[1]===254 ? 'utf-16le' : buffer[0]===254 && buffer[1]===255 ? 'utf-16be' : 'utf-8').decode(buffer) : '';
  if (content.length > 2_000_000) throw new Error('The text is too long; import it in batches');
  const r = parseQuestionsFromMarkdown(content);
  return { ...r, count: r.questions.length, text: content.slice(0,200000) };
}
module.exports = { parseDocument };
