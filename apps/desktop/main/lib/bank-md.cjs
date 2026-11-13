// Question bank: parse questions out of Markdown.
//
// ★ Why Markdown is the "source" for the question bank:
//   Most questions users already have live in Word / Markdown / web pages.
//   Rather than build a complicated importer, we define a format that is
//   **simple enough to remember**, so people are willing to tidy it up by
//   hand. The simpler the format, the more likely a bank actually gets built.
//
// Supported format (field lines are optional; the stem is required):
//
//   ### 题目
//   题型：选择题
//   难度：3
//   知识点：二次函数, 顶点式
//   来源：广东中考
//   年份：2023
//   科目：数学
//   题干：
//   已知二次函数 y = a(x-h)² + k，顶点坐标是（  ）
//   A. (h, k)
//   B. (-h, k)
//   C. (h, -k)
//   D. (-h, -k)
//   答案：A
//   解析：顶点式 y = a(x-h)² + k 的顶点就是 (h, k)。
//
// ★ Tolerates several common spellings:
//   · "题型" may be Chinese (选择题) or English (choice)
//   · "答案" may also be written "答案:" / "答案："
//   · Choice options support the prefixes A. / A、 / A) / （A）
//   · When there is no "题干：" prefix, the first paragraph of the block is the stem
const TYPE_ALIAS = {
  "选择题": "choice", "选择": "choice", choice: "choice", "单选": "choice", "多选": "choice",
  "填空题": "fill", "填空": "fill", fill: "fill",
  "解答题": "answer", "解答": "answer", "简答": "answer", answer: "answer",
  "证明题": "proof", "证明": "proof", proof: "proof",
  "计算题": "calc", "计算": "calc", calc: "calc",
};

/** Parse lists such as "知识点：A, B、C". */
function splitList(s) {
  return String(s ?? "")
    .split(/[,，、;；]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Parse an option line.
 * Supports the prefixes A. / A、 / A) / （A） / A． and so on.
 */
function parseOption(line) {
  const m = /^\s*[（(]?\s*([A-Ha-h])\s*[.、．)）:：]\s*(.+)$/.exec(line);
  if (!m) return null;
  return { label: m[1].toUpperCase(), text: m[2].trim() };
}

/**
 * Parse questions from a block of text.
 *
 * @param {string} text Markdown source text
 * @returns {{ok:boolean, questions:Array, warnings:string[]}}
 */
function parseQuestionsFromMarkdown(text) {
  const questions = [];
  const warnings = [];
  if (!text || !text.trim()) return { ok: true, questions, warnings };

  // Split into blocks by heading lines. Any heading of level three or deeper
  // (###、####) starts a new question; with no headings at all, treat the
  // whole text as one question.
  let sourceText = String(text).replace(/^\uFEFF/, '').replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/, '').replace(/\r\n?/g, "\n");
  // Ordinary question lists from text/Word/PDF also have numbered beginnings.
  if (!/^\s{0,3}#{2,6}\s+/m.test(sourceText)) {
    const numbered = /^(?:第\s*(\d+)\s*题[：:]?|([0-9]{1,3})[.．、)）])\s*(\S.*)$/gm;
    const matches = [...sourceText.matchAll(numbered)];
    if (matches.length) {
      sourceText = sourceText.slice(matches[0].index).replace(numbered, (_m,a,b,stem) => `### 第 ${a || b} 题\n题干：${stem}`);
    }
  }
  const lines = sourceText.split("\n");
  const blocks = [];
  let cur = null;
  const questionLevel = lines.find(l => /^\s{0,3}#{2,6}\s+(?:第\s*\d+\s*题|题目|例题|练习)/.test(l))?.trim().match(/^#+/)[0].length
    || (lines.some(l => /^\s{0,3}###\s+\S/.test(l)) ? 3 : 2);
  const isHeading = l => new RegExp('^\\s{0,3}#{' + questionLevel + '}\\s+\\S').test(l);
  const hasHeadings = lines.some(isHeading);
  let fence = null;

  for (const line of lines) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      if (cur) cur.lines.push(line);
      continue;
    }
    if (fence) { if (cur) cur.lines.push(line); continue; }
    if (isHeading(line)) {
      if (cur) blocks.push(cur);
      cur = { heading: line.replace(/^\s{0,3}#{2,6}\s+/, "").trim(), lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      // Content before any heading starts its own block if non-empty
      if (!hasHeadings && line.trim() && !/^#\s/.test(line)) cur = { heading: "", lines: [line] };
    }
  }
  if (cur) blocks.push(cur);

  const FIELD = /^\s*(题型|类型|难度|知识点|考点|来源|年份|科目|答案|解析|解答|题干|题目)\s*[:：]\s*(.*)$/;

  for (const [bi, b] of blocks.entries()) {
    const q = {
      type: "answer",
      stem: "",
      options: [],
      answer: "",
      solution: "",
      kps: [],
      difficulty: 3,
      source: "",
      year: null,
      subject: "",
    };
    // Which field's content is currently being written (multi-line fields: stem/solution)
    let field = null;
    const stemLines = [];
    const solutionLines = [];
    const extraLines = [];   // loose lines outside fields and before the stem
    let blockFence = null;
    const append = line => {
      if (field === 'stem') stemLines.push(line);
      else if (field === 'solution') solutionLines.push(line);
      else if (field === 'answer') q.answer += (q.answer ? '\n' : '') + line;
      else extraLines.push(line);
    };

    const flushField = () => { field = null; };

    for (const raw of b.lines) {
      const line = raw;
      const fenceMarker=/^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (fenceMarker) { if (!blockFence) blockFence=fenceMarker; else if (blockFence[0]===fenceMarker[0] && fenceMarker.length>=blockFence.length) blockFence=null; append(line); continue; }
      if (blockFence) { append(line); continue; }
      const fieldLine = line.replace(/^\s*(?:[-*]\s+)?\*\*([^*]+)\*\*\s*[:：]?\s*/, (_m,label) => label.replace(/[:：]$/,'')+'：');
      const m = FIELD.exec(fieldLine);
      if (m) {
        const key = m[1];
        const val = m[2].trim();
        flushField();
        switch (key) {
          case "题型": case "类型": {
            const t = TYPE_ALIAS[val.toLowerCase()] ?? TYPE_ALIAS[val];
            if (t) q.type = t;
            else if (val) warnings.push(`Block ${bi + 1}: unknown question type "${val}", treating as free response`);
            break;
          }
          case "难度": {
            const n = Number(String(val).replace(/[^\d.]/g, ""));
            if (Number.isFinite(n) && n >= 1 && n <= 5) q.difficulty = Math.round(n);
            else if (val) warnings.push(`Block ${bi + 1}: difficulty "${val}" is not 1~5, treating as 3`);
            break;
          }
          case "知识点": case "考点": q.kps = splitList(val); break;
          case "来源": q.source = val; break;
          case "年份": {
            const y = Number(String(val).replace(/[^\d]/g, ""));
            if (y > 1900 && y < 2200) q.year = y;
            break;
          }
          case "科目": q.subject = val; break;
          case "答案": q.answer = val; field = "answer"; break;
          case "解析": case "解答": if (val) solutionLines.push(val); field = "solution"; break;
          case "题干": case "题目": if (val) stemLines.push(val); field = "stem"; break;
        }
        continue;
      }

      // Option line
      const opt = field === 'stem' || field === null ? parseOption(line) : null;
      if (opt) { q.options.push(opt); continue; }

      // Continuation line
      if (field === "stem") stemLines.push(line);
      else if (field === "solution") solutionLines.push(line);
      else if (field === "answer") q.answer += (q.answer ? "\n" : "") + line.trim();
      else extraLines.push(line);
    }

    // Stem: prefer content under an explicit "题干：" line; otherwise fall back to loose lines
    if (!stemLines.length && extraLines.length) {
      stemLines.push(...extraLines);
    }

    q.stem = stemLines.join("\n").trim();
    const headingIsStem=!q.stem && b.heading && !/^(?:题目|第\s*\d+\s*题|例题|练习)/.test(b.heading) && (q.answer || q.options.length);
    if (headingIsStem) q.stem=b.heading;
    q.answer = q.answer.trim();
    if (!q.solution && solutionLines.length) q.solution = solutionLines.join("\n").trim();

    // Skip blocks with no stem (they may be purely descriptive heading blocks)
    if (!q.stem) {
      if (b.heading || extraLines.some((l) => l.trim())) {
        warnings.push(`Block ${bi + 1}${b.heading ? ` "${b.heading}"` : ""} has no stem, skipped`);
      }
      continue;
    }
    // If the heading doesn't look like "题目/第 N 题", treat it as part of the
    // stem (some notes put the stem in the heading)
    if (!headingIsStem && b.heading && !/^题目|^第\s*\d+\s*题|^例题|^练习/.test(b.heading)) {
      q.stem = `${b.heading}\n${q.stem}`;
    }
    questions.push(q);
  }

  return { ok: true, questions, warnings };
}

/**
 * Generate Markdown from the question bank.
 * Used to "export existing questions into an editable document".
 */
function questionsToMarkdown(questions, { withAnswers = true } = {}) {
  const TYPE_NAME = { choice: "选择题", fill: "填空题", answer: "解答题", proof: "证明题", calc: "计算题" };
  const out = [];
  for (const [i, q] of questions.entries()) {
    out.push(`### 第 ${i + 1} 题`);
    out.push(`题型：${TYPE_NAME[q.type] ?? q.type}`);
    out.push(`难度：${q.difficulty}`);
    if (q.kps?.length) out.push(`知识点：${q.kps.join("、")}`);
    if (q.source) out.push(`来源：${q.source}`);
    if (q.year) out.push(`年份：${q.year}`);
    if (q.subject) out.push(`科目：${q.subject}`);
    out.push("");
    out.push("题干：");
    out.push(q.stem);
    if (q.options?.length) {
      out.push("");
      for (const o of q.options) out.push(`${o.label}. ${o.text}`);
    }
    if (withAnswers) {
      if (q.answer) { out.push(""); out.push(`答案：${q.answer}`); }
      if (q.solution) { out.push(""); out.push(`解析：${q.solution}`); }
    }
    out.push("");
  }
  return out.join("\n");
}

module.exports = { parseQuestionsFromMarkdown, questionsToMarkdown, TYPE_ALIAS };
