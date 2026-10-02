// 题库：把 Markdown 里的题目解析出来
//
// ★ 为什么用 Markdown 当题库的"源"：
//   用户手里已有的题目大多在 Word / Markdown / 网页里。
//   与其做一个复杂的导入器，不如定一个**简单到能记住**的格式，
//   让人手工整理也愿意。格式越简单，题库才建得起来。
//
// 支持的格式（字段行可选，题干必须有）：
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
// ★ 兼容几种常见写法：
//   · "题型"可写中文（选择题）或英文（choice）
//   · "答案"也可写 "答案:" / "答案：" 
//   · 选择题选项支持 A. / A、 / A) / （A） 几种前缀
//   · 没有"题干："前缀时，题目块的第一段就是题干
const TYPE_ALIAS = {
  "选择题": "choice", "选择": "choice", choice: "choice", "单选": "choice", "多选": "choice",
  "填空题": "fill", "填空": "fill", fill: "fill",
  "解答题": "answer", "解答": "answer", "简答": "answer", answer: "answer",
  "证明题": "proof", "证明": "proof", proof: "proof",
  "计算题": "calc", "计算": "calc", calc: "calc",
};

/** 解析 "知识点：A, B、C" 这类列表 */
function splitList(s) {
  return String(s ?? "")
    .split(/[,，、;；]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * 解析选项行。
 * 支持 A. / A、 / A) / （A） / A． 等前缀。
 */
function parseOption(line) {
  const m = /^\s*[（(]?\s*([A-Ha-h])\s*[.、．)）:：]\s*(.+)$/.exec(line);
  if (!m) return null;
  return { label: m[1].toUpperCase(), text: m[2].trim() };
}

/**
 * 从一段文本里解析题目。
 *
 * @param {string} text Markdown 原文
 * @returns {{ok:boolean, questions:Array, warnings:string[]}}
 */
function parseQuestionsFromMarkdown(text) {
  const questions = [];
  const warnings = [];
  if (!text || !text.trim()) return { ok: true, questions, warnings };

  // 按标题行切块。三级以上标题（###、####）都算一道题的开头；
  // 如果全文没有任何标题，就把全文当成一道题。
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let cur = null;
  const isHeading = (l) => /^\s{0,3}#{2,6}\s+\S/.test(l);

  for (const line of lines) {
    if (isHeading(line)) {
      if (cur) blocks.push(cur);
      cur = { heading: line.replace(/^\s{0,3}#{2,6}\s+/, "").trim(), lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      // 标题之前的内容，如果非空就自己起一块
      if (line.trim()) cur = { heading: "", lines: [line] };
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
    // 当前正在写哪个字段的内容（多行字段：题干/解析）
    let field = null;
    const stemLines = [];
    const solutionLines = [];
    const extraLines = [];   // 题干之前、字段之外的散行

    const flushField = () => { field = null; };

    for (const raw of b.lines) {
      const line = raw;
      const m = FIELD.exec(line);
      if (m) {
        const key = m[1];
        const val = m[2].trim();
        flushField();
        switch (key) {
          case "题型": case "类型": {
            const t = TYPE_ALIAS[val.toLowerCase()] ?? TYPE_ALIAS[val];
            if (t) q.type = t;
            else if (val) warnings.push(`第 ${bi + 1} 块：不认识的题型「${val}」，按解答题处理`);
            break;
          }
          case "难度": {
            const n = Number(String(val).replace(/[^\d.]/g, ""));
            if (Number.isFinite(n) && n >= 1 && n <= 5) q.difficulty = Math.round(n);
            else if (val) warnings.push(`第 ${bi + 1} 块：难度「${val}」不是 1~5，按 3 处理`);
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
          case "答案": q.answer = val; field = val ? null : "answer"; break;
          case "解析": case "解答": q.solution = val; field = val ? null : "solution"; break;
          case "题干": case "题目": if (val) stemLines.push(val); field = "stem"; break;
        }
        continue;
      }

      // 选项行
      const opt = parseOption(line);
      if (opt) { q.options.push(opt); continue; }

      // 续行
      if (field === "stem") stemLines.push(line);
      else if (field === "solution") solutionLines.push(line);
      else if (field === "answer") q.answer += (q.answer ? "\n" : "") + line.trim();
      else extraLines.push(line);
    }

    // 题干：优先用显式"题干："下的内容；没有再退回散行
    if (!stemLines.length && extraLines.length) {
      stemLines.push(...extraLines);
    }

    q.stem = stemLines.join("\n").trim();
    if (!q.solution && solutionLines.length) q.solution = solutionLines.join("\n").trim();

    // 没有题干就跳过（可能是纯说明性的标题块）
    if (!q.stem) {
      if (b.heading || extraLines.some((l) => l.trim())) {
        warnings.push(`第 ${bi + 1} 块${b.heading ? `「${b.heading}」` : ""}没有题干，已跳过`);
      }
      continue;
    }
    // 标题如果不像"题目/第 N 题"这类，就当作题干的一部分（有些整理稿把题干写在标题里）
    if (b.heading && !/^题目|^第\s*\d+\s*题|^例题|^练习/.test(b.heading)) {
      q.stem = `${b.heading}\n${q.stem}`;
    }
    questions.push(q);
  }

  return { ok: true, questions, warnings };
}

/**
 * 从题库反向生成 Markdown。
 * 用于"把库里已有的题导出成可编辑的文档"。
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
