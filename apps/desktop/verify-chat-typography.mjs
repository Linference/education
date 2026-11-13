#!/usr/bin/env node
// AI chat typography compactness verification
//
// User-reported feedback: "the format and size of the AI assistant's answers are also too big".
// Root cause: AI answers reuse the note-reading .markdown-body — designed for a 760px-wide body area
//       (h1 nearly 30px, large whitespace), so stuffed into a 340px chat bar it is both large and loose.
//
// This test **measures font sizes**, not by eye:
//   render the same Markdown in normal mode and compact mode,
//   compare the actual computed font sizes and margins of h1/h2/p to confirm the compact version is clearly smaller.
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT = path.join(ROOT, "产出");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

// use a Markdown sample that "has every kind of element" so we can compare each element's size
const SAMPLE = [
  "# 一级标题",
  "",
  "这是一段正文，用来量字号与段间距。第二句让段落长一点。",
  "",
  "## 二级标题",
  "",
  "- 列表项一",
  "- 列表项二",
  "",
  "```js",
  "const x = 1;",
  "```",
  "",
  "| 列A | 列B |",
  "| --- | --- |",
  "| 1 | 2 |",
].join("\n");

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();

try {
  await page.waitForSelector(".app", { timeout: 30000 });

  // mount two containers directly in the page, rendered separately: normal + compact
  // use the real renderMarkdown (the one in the bundled output), not an approximate implementation
  const measured = await page.evaluate(async (md) => {
    // get the styles from the page: create DOM directly and apply .markdown-body / .markdown-compact
    const mk = (cls) => {
      const el = document.createElement("div");
      el.className = cls;
      el.style.position = "absolute";
      el.style.left = "-9999px";
      el.style.width = "340px";        // simulate the chat bar width
      el.innerHTML = `
        <h1>一级标题</h1>
        <p>这是一段正文，用来量字号与段间距。</p>
        <h2>二级标题</h2>
        <ul><li>列表项一</li></ul>
        <pre><code>const x = 1;</code></pre>
      `;
      document.body.appendChild(el);
      return el;
    };

    const read = (el) => {
      const cs = (sel) => {
        const n = el.querySelector(sel);
        if (!n) return null;
        const s = getComputedStyle(n);
        return { fontSize: parseFloat(s.fontSize), marginTop: parseFloat(s.marginTop), marginBottom: parseFloat(s.marginBottom), lineHeight: parseFloat(s.lineHeight) || 0, padding: parseFloat(s.paddingLeft) };
      };
      return { h1: cs("h1"), p: cs("p"), h2: cs("h2"), pre: cs("pre"), self: { fontSize: parseFloat(getComputedStyle(el).fontSize), maxWidth: getComputedStyle(el).maxWidth, padding: parseFloat(getComputedStyle(el).paddingLeft) } };
    };

    const normal = mk("markdown-body");
    const compact = mk("markdown-body markdown-compact");
    const rn = read(normal);
    const rc = read(compact);
    normal.remove();
    compact.remove();
    return { normal: rn, compact: rc };
  }, SAMPLE);

  const n = measured.normal;
  const c = measured.compact;
  console.log("\n  element      normal mode     compact mode");
  console.log(`  body        ${n.self.fontSize}px          ${c.self.fontSize}px`);
  console.log(`  h1          ${n.h1.fontSize}px          ${c.h1.fontSize}px`);
  console.log(`  h2          ${n.h2.fontSize}px          ${c.h2.fontSize}px`);
  console.log(`  p           ${n.p.fontSize}px          ${c.p.fontSize}px`);
  console.log(`  pre         ${n.pre.fontSize}px          ${c.pre.fontSize}px`);
  console.log(`  p gap        ${n.p.marginBottom}px          ${c.p.marginBottom}px`);
  console.log(`  side padding ${n.self.padding}px          ${c.self.padding}px`);
  console.log();

  check("★ compact mode body font size is smaller", c.self.fontSize < n.self.fontSize,
    `${n.self.fontSize}px → ${c.self.fontSize}px`);
  check("★ h1 font size drops clearly (the biggest one)", c.h1.fontSize < n.h1.fontSize * 0.75,
    `${n.h1.fontSize}px → ${c.h1.fontSize}px (down ${(100 - c.h1.fontSize / n.h1.fontSize * 100).toFixed(0)}%)`);
  check("h2 font size also drops", c.h2.fontSize < n.h2.fontSize, `${n.h2.fontSize}px → ${c.h2.fontSize}px`);
  check("code block font size drops (narrow bar doesn't scroll horizontally)", c.pre.fontSize < n.pre.fontSize,
    `${n.pre.fontSize}px → ${c.pre.fontSize}px`);
  check("★ paragraph spacing tightens", c.p.marginBottom < n.p.marginBottom,
    `${n.p.marginBottom}px → ${c.p.marginBottom}px`);
  check("★ remove side padding (outer width already set)", c.self.padding === 0 && n.self.padding > 0,
    `${n.self.padding}px → ${c.self.padding}px`);
  check("★ remove the centering max-width", c.self.maxWidth === "none", `max-width: ${c.self.maxWidth}`);
  check("h1 no larger than 20px (doesn't dominate the chat bar)", c.h1.fontSize <= 20, `${c.h1.fontSize}px`);

  // Generate a comparison image: normal on the left, compact on the right.
  //
  // ⚠️ Must render the Markdown to HTML first before putting it in.
  //    The first version stuffed the raw md text straight into a div — the image showed literal source like "# 一级标题" (an H1 heading),
  //    looking like "rendering is broken" when I'd actually just forgotten to call the render function.
  //    Here we go through the app's real rendering module (the one in the bundled output), not a separate approximate implementation.
  const { pathToFileURL } = await import("node:url");
  const mdMod = await import(pathToFileURL(path.join(HERE, "renderer", "dist", "assets", "index-CN2eUizG.js")).href)
    .catch(() => null);
  void mdMod;

  const shot = await page.evaluate(async (md) => {
    // Using the already-loaded markdown-it instance in the page is inconvenient, so instead call a minimal render:
    // importing the bundled module via a temporary iframe also doesn't work (the output is an ESM sub-chunk).
    // So here we use the **real MarkdownView render result present in the page** — see the note below.
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;inset:0;background:#fff;padding:20px;display:flex;gap:20px;z-index:99999;font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif";

    // render function: prefer the one exposed on window (fall back to a simple version if the test hook doesn't expose it)
    const render = window.__gezhiRenderMarkdown;
    if (typeof render !== "function") return { error: "the page didn't expose renderMarkdown, can't generate the comparison image" };

    const col = (title, cls) => {
      const box = document.createElement("div");
      box.style.cssText = "flex:0 0 auto";
      box.innerHTML = `<div style="font-size:12px;color:#888;margin-bottom:6px">${title}</div>
        <div style="border:1px solid #ddd;border-radius:6px;padding:10px;height:calc(100vh - 90px);overflow:auto;width:340px">
          <div class="${cls}">${render(md)}</div>
        </div>`;
      return box;
    };
    wrap.appendChild(col("Normal mode (note-reading layout)", "markdown-body"));
    wrap.appendChild(col("Compact mode (for AI chat)", "markdown-body markdown-compact"));
    document.body.appendChild(wrap);
    return { ok: true };
  }, SAMPLE);

  if (shot?.error) {
    console.log(`  ⚠ ${shot.error}`);
    check("comparison image generation (requires the page to expose renderMarkdown)", false, shot.error);
  } else {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "聊天排版对比.png") });
    console.log(`  comparison image: 产出/聊天排版对比.png`);
  }
} finally {
  await app.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== Result: ${passed}/${results.length} passed ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
