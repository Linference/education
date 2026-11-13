#!/usr/bin/env node
// 格致 (Gezhi) · UI rendering verification (visible evidence)
//
// The previous smoke test only proved "the process starts and IPC works", **not that rendering is correct**.
// This script does the truly important part:
//   open a Markdown that has "a bit of everything", check the DOM really contains
//   <h1>/<table>/<pre><code>/KaTeX nodes/task lists/wikilinks,
//   and take a screenshot of both PDF and Word.
//
// Artifacts: 产出/ui-*.png (can be checked by eye directly)
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = HERE;
const OUT = path.resolve(HERE, "..", "..", "产出");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
  return Boolean(ok);
}

// ---------------------------------------------------------------- test vault
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-render-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"),
  JSON.stringify({ schemaVersion: 1, id: "render-test", name: "渲染测试库" }, null, 2), "utf8");
fs.mkdirSync(path.join(vault, "笔记"), { recursive: true });

const MD = path.join(vault, "笔记", "情态动词.md");
fs.writeFileSync(MD, [
  "---",
  "type: 语法笔记",
  "tags: [英语, 语法, 情态动词]",
  "source: 人教版必修",
  "---",
  "",
  "# 情态动词",
  "",
  "情态动词表示说话人对动作的**态度**：必须、可能、允许、推测。",
  "",
  "## 三个最容易混的",
  "",
  "| 情态动词 | 把握 | 语境 |",
  "| --- | --- | --- |",
  "| `must` | 高 | 有证据的肯定推断 |",
  "| `may` | 中 | 把握不大 |",
  "",
  "## 形式化",
  "",
  "$$P(A|B) = \\frac{P(B|A)P(A)}{P(B)}$$",
  "",
  "行内公式 $E = mc^2$ 也要渲染。",
  "",
  "## 判定规则",
  "",
  "```python",
  "def infer(ratio: float) -> str:",
  '    """根据证据强度选择。"""',
  "    return \"must\" if ratio > 0.85 else \"may\"",
  "```",
  "",
  "- [ ] 用 must / may / can't 各造一句",
  "- [x] 把同学的句子拿来判断",
  "",
  "相关：[[虚拟语气]] 与 #语法/情态动词",
  "",
  "> 引用块也要能渲染。",
  "",
].join("\n"), "utf8");

// 最小合法 PDF
const PDF = path.join(vault, "笔记", "sample.pdf");
{
  const objs = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
  ];
  const stream = "BT /F1 28 Tf 72 740 Td (Gezhi PDF render test) Tj ET";
  objs.push(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  objs.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  let pdf = "%PDF-1.4\n";
  const offs = [0];
  for (const o of objs) { offs.push(pdf.length); pdf += o; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) pdf += String(offs[i]).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(PDF, Buffer.from(pdf, "binary"));
}

console.log("=== 格致 (Gezhi) · UI rendering verification ===");

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [APP_DIR],
  // ⚠️ Must set GEZHI_TEST=1 — the test hook window.__gezhiTest is only mounted
  //    when the main process adds ?test=1 to the page (no longer unconditionally enabled
  //    in production builds).
  //    Missing this gets stuck at the waitForFunction below, reporting "timeout" instead of
  //    "environment variable not set", which is hard to diagnose at a glance.
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  // open the vault and the file
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(500);
  check("file tree renders entries", (await page.locator(".tree-row").count()) > 0,
    `${await page.locator(".tree-row").count()} rows`);

  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), MD);
  await page.waitForTimeout(900);

  // ---- core: what Markdown actually renders to ----
  const dom = await page.evaluate(() => {
    const b = document.querySelector(".markdown-body");
    if (!b) return null;
    return {
      h1: [...b.querySelectorAll("h1")].map((e) => e.textContent),
      h2: [...b.querySelectorAll("h2")].map((e) => e.textContent),
      tables: b.querySelectorAll("table").length,
      tds: b.querySelectorAll("td").length,
      pre: b.querySelectorAll("pre").length,
      codeHighlighted: b.querySelectorAll("pre code span").length,
      katexInline: b.querySelectorAll(".katex").length,
      katexDisplay: b.querySelectorAll(".katex-display").length,
      taskItems: b.querySelectorAll("input[type=checkbox]").length,
      wikilinks: [...b.querySelectorAll("a.wikilink")].map((a) => a.textContent),
      tags: [...b.querySelectorAll(".tag-chip")].map((e) => e.textContent),
      blockquote: b.querySelectorAll("blockquote").length,
      strong: b.querySelectorAll("strong").length,
      // did it dump the markdown source verbatim (meaning no rendering)
      rawHashLeak: b.textContent?.includes("## ") ?? false,
      rawPipeLeak: b.textContent?.includes("| --- |") ?? false,
    };
  });

  check("Markdown is rendered (source not shown verbatim)", dom !== null && !dom.rawHashLeak && !dom.rawPipeLeak);
  check("h1 rendered", (dom?.h1?.length ?? 0) > 0, JSON.stringify(dom?.h1));
  check("h2 rendered", (dom?.h2?.length ?? 0) >= 2, JSON.stringify(dom?.h2));
  check("table rendered", (dom?.tables ?? 0) > 0, `${dom?.tables} tables / ${dom?.tds} cells`);
  check("code block rendered and syntax highlighted", (dom?.pre ?? 0) > 0 && (dom?.codeHighlighted ?? 0) > 3,
    `${dom?.pre} pre, ${dom?.codeHighlighted} highlight spans`);
  check("★ block formula rendered (KaTeX)", (dom?.katexDisplay ?? 0) > 0, `${dom?.katexDisplay} block`);
  check("★ inline formula rendered (KaTeX)", (dom?.katexInline ?? 0) > 1, `${dom?.katexInline} katex nodes`);
  check("task list rendered as checkboxes", (dom?.taskItems ?? 0) >= 2, `${dom?.taskItems}`);
  check("wikilinks rendered as links", (dom?.wikilinks?.length ?? 0) > 0, JSON.stringify(dom?.wikilinks));
  check("tags rendered as chips", (dom?.tags?.length ?? 0) > 0, JSON.stringify(dom?.tags));
  check("blockquote rendered", (dom?.blockquote ?? 0) > 0);
  check("bold rendered", (dom?.strong ?? 0) > 0);

  // properties panel
  const props = await page.evaluate(() => {
    const p = document.querySelector(".props");
    return p ? { title: p.querySelector(".props-title")?.textContent, rows: p.querySelectorAll(".prop-row").length, chips: p.querySelectorAll(".tag-chip").length } : null;
  });
  check("★ YAML properties panel rendered", props !== null && props.rows >= 3, props ? `${props.rows} property rows, ${props.chips} tags` : "none");

  // status bar word/char count
  const statusText = await page.locator(".statusbar").innerText();
  check("status bar shows word/char count", /个词|个字符/.test(statusText), statusText.replace(/\n/g, " | "));

  await page.screenshot({ path: path.join(OUT, "ui-markdown.png") });

  // ---- PDF ----
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), PDF);
  await page.waitForTimeout(2500);
  const pdfDom = await page.evaluate(() => ({
    toolbar: document.querySelector(".pdf-toolbar")?.textContent ?? "",
    canvases: document.querySelectorAll(".pdf-canvas-wrap canvas").length,
    canvasW: document.querySelector(".pdf-canvas-wrap canvas")?.width ?? 0,
    canvasH: document.querySelector(".pdf-canvas-wrap canvas")?.height ?? 0,
  }));
  check("★ PDF page renders a canvas", pdfDom.canvases > 0 && pdfDom.canvasW > 100 && pdfDom.canvasH > 100,
    `${pdfDom.canvasW}×${pdfDom.canvasH}`);
  check("PDF toolbar shows page numbers", /第\s*\d+\s*\/\s*\d+\s*页/.test(pdfDom.toolbar), pdfDom.toolbar.slice(0, 60));
  await page.screenshot({ path: path.join(OUT, "ui-pdf.png") });

  check("renderer process has no JS errors", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* ignore */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== result: ${passed}/${results.length} passed ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
console.log(`\nscreenshots: 产出/ui-markdown.png, 产出/ui-pdf.png`);
process.exit(passed === results.length ? 0 : 1);
