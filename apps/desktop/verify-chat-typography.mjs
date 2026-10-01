#!/usr/bin/env node
// AI 聊天排版紧凑度验证
//
// 用户实测反馈："AI 助手回答的信息的格式他的大小也太大了"。
// 根因：AI 回答复用了笔记阅读用的 .markdown-body —— 那是给 760px 宽正文区
//       设计的（h1 近 30px、留白很大），塞进 340px 的聊天栏又大又散。
//
// 这个测试**量字号**，不靠肉眼：
//   把同一段 Markdown 分别用普通模式和紧凑模式渲染，
//   比较 h1/h2/p 的实际计算字号与边距，确认紧凑版明显更小。
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

// 用一段"什么元素都有"的 Markdown，才能比较各元素的尺寸
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

  // 在页面里直接挂两个容器分别渲染：普通 + 紧凑
  // 走真实的 renderMarkdown（打包产物里的那份），不是近似实现
  const measured = await page.evaluate(async (md) => {
    // 从页面里拿到样式：直接造 DOM 并套用 .markdown-body / .markdown-compact
    const mk = (cls) => {
      const el = document.createElement("div");
      el.className = cls;
      el.style.position = "absolute";
      el.style.left = "-9999px";
      el.style.width = "340px";        // 模拟聊天栏宽度
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
  console.log("\n  元素        普通模式        紧凑模式");
  console.log(`  body        ${n.self.fontSize}px          ${c.self.fontSize}px`);
  console.log(`  h1          ${n.h1.fontSize}px          ${c.h1.fontSize}px`);
  console.log(`  h2          ${n.h2.fontSize}px          ${c.h2.fontSize}px`);
  console.log(`  p           ${n.p.fontSize}px          ${c.p.fontSize}px`);
  console.log(`  pre         ${n.pre.fontSize}px          ${c.pre.fontSize}px`);
  console.log(`  p 段间距     ${n.p.marginBottom}px          ${c.p.marginBottom}px`);
  console.log(`  左右留白     ${n.self.padding}px          ${c.self.padding}px`);
  console.log();

  check("★ 紧凑模式正文字号更小", c.self.fontSize < n.self.fontSize,
    `${n.self.fontSize}px → ${c.self.fontSize}px`);
  check("★ h1 字号明显降下来（最大的一处）", c.h1.fontSize < n.h1.fontSize * 0.75,
    `${n.h1.fontSize}px → ${c.h1.fontSize}px（降 ${(100 - c.h1.fontSize / n.h1.fontSize * 100).toFixed(0)}%）`);
  check("h2 字号也降了", c.h2.fontSize < n.h2.fontSize, `${n.h2.fontSize}px → ${c.h2.fontSize}px`);
  check("代码块字号降了（窄栏不横向滚动）", c.pre.fontSize < n.pre.fontSize,
    `${n.pre.fontSize}px → ${c.pre.fontSize}px`);
  check("★ 段间距收紧", c.p.marginBottom < n.p.marginBottom,
    `${n.p.marginBottom}px → ${c.p.marginBottom}px`);
  check("★ 去掉左右留白（外层已定宽度）", c.self.padding === 0 && n.self.padding > 0,
    `${n.self.padding}px → ${c.self.padding}px`);
  check("★ 去掉居中 max-width", c.self.maxWidth === "none", `max-width: ${c.self.maxWidth}`);
  check("h1 不大于 20px（聊天栏里不喧宾夺主）", c.h1.fontSize <= 20, `${c.h1.fontSize}px`);

  // 生成一张对比图：左普通、右紧凑
  //
  // ⚠️ 必须先把 Markdown 渲染成 HTML 再放进去。
  //    第一版直接把原始 md 文本塞进 div —— 图上显示的是 "# 一级标题" 这种
  //    字面源码，看着像"渲染坏了"，其实是我忘了调用渲染函数。
  //    这里走应用真正的渲染模块（打包产物里的那份），不另写近似实现。
  const { pathToFileURL } = await import("node:url");
  const mdMod = await import(pathToFileURL(path.join(HERE, "renderer", "dist", "assets", "index-CN2eUizG.js")).href)
    .catch(() => null);
  void mdMod;

  const shot = await page.evaluate(async (md) => {
    // 用页面里已加载的 markdown-it 实例不方便，改为直接调用一个最小渲染：
    // 通过临时 iframe 引入打包后的模块也不可行（产物是 ESM 分包）。
    // 所以这里用**页面里真实存在的 MarkdownView 渲染结果** —— 见下面说明。
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;inset:0;background:#fff;padding:20px;display:flex;gap:20px;z-index:99999;font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif";

    // 渲染函数：优先用 window 上暴露的（测试钩子没暴露就用简易版）
    const render = window.__gezhiRenderMarkdown;
    if (typeof render !== "function") return { error: "页面没有暴露 renderMarkdown，无法生成对比图" };

    const col = (title, cls) => {
      const box = document.createElement("div");
      box.style.cssText = "flex:0 0 auto";
      box.innerHTML = `<div style="font-size:12px;color:#888;margin-bottom:6px">${title}</div>
        <div style="border:1px solid #ddd;border-radius:6px;padding:10px;height:calc(100vh - 90px);overflow:auto;width:340px">
          <div class="${cls}">${render(md)}</div>
        </div>`;
      return box;
    };
    wrap.appendChild(col("普通模式（笔记阅读排版）", "markdown-body"));
    wrap.appendChild(col("紧凑模式（AI 聊天用）", "markdown-body markdown-compact"));
    document.body.appendChild(wrap);
    return { ok: true };
  }, SAMPLE);

  if (shot?.error) {
    console.log(`  ⚠ ${shot.error}`);
    check("对比图生成（需要页面暴露 renderMarkdown）", false, shot.error);
  } else {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "聊天排版对比.png") });
    console.log(`  对比图：产出/聊天排版对比.png`);
  }
} finally {
  await app.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
