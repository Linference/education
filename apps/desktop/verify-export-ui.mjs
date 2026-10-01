#!/usr/bin/env node
// 界面里的导出功能验证（端到端）
//
// 走真实路径：打开库 → 打开 Markdown → 点导出 → 选格式 → 检查文件真的生成了。
// 上一层的 verify-export.mjs 测的是导出内核；这个测的是"用户在界面上点得到吗"。
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "..", "..", "产出");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

// ---- 造库 ----
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-exp-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"),
  JSON.stringify({ id: "exp-test", name: "导出测试库" }), "utf8");

const MD = [
  "---",
  "type: 语法笔记",
  "tags: [英语, 语法]",
  "---",
  "",
  "# 情态动词",
  "",
  "情态动词表示说话人对动作的**态度**。",
  "",
  "## 一、对比",
  "",
  "| 情态动词 | 把握 | 语境 |",
  "| --- | --- | --- |",
  "| `must` | 高 | 有证据 |",
  "| `may` | 中 | 把握不大 |",
  "",
  "## 二、公式",
  "",
  "$$\\frac{P(B|A)P(A)}{P(B)}$$",
  "",
  "行内 $E = mc^2$ 也要渲染。",
  "",
  "- [ ] 造三个句子",
  "- [x] 判断同学写的",
  "",
  "相关：[[虚拟语气]]",
  "",
].join("\n");

const target = path.join(vault, "情态动词.md");
fs.writeFileSync(target, MD, "utf8");

console.log("=== 界面导出功能验证 ===");
console.log(`  测试库：${vault}\n`);

const app = await electron.launch({
  executablePath: path.join(HERE, "node_modules", "electron", "dist", "electron.exe"),
  args: [HERE],
  env: { ...process.env, GEZHI_TEST: "1" },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

try {
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  // ---- 1. 主进程能力探测 ----
  const probe = await page.evaluate(() => window.gezhi.exporter.probe());
  check("★ 探测到 Typst（PDF 可用）", probe.pdf.available === true,
    probe.pdf.available ? path.basename(probe.pdf.engine ?? "") : String(probe.pdf.reason));
  check("探测到 python-docx（Word 可用）", probe.docx.available === true,
    probe.docx.available ? path.basename(probe.docx.engine ?? "") : String(probe.docx.reason));
  check("Markdown 永远可用", probe.markdown.available === true);
  check("模板路径可解析", Boolean(probe.paths.templatePath));

  // ---- 2. 打开文件，UI 上应出现导出按钮 ----
  await page.evaluate((d) => window.__gezhiTest.openVault(d), vault);
  await page.waitForTimeout(400);
  await page.evaluate((p) => window.__gezhiTest.openFileByPath(p), target);
  await page.waitForTimeout(800);

  const exportBtn = page.locator("button", { hasText: "导出" }).first();
  check("★ 界面上出现「导出」按钮", (await exportBtn.count()) > 0);

  // 点开菜单，确认三个格式都在
  await exportBtn.click();
  await page.waitForTimeout(600);
  const menuText = await page.locator("text=格式由你决定").count();
  check("★ 导出菜单打开（说明格式由用户选）", menuText > 0);
  for (const f of ["PDF", "Word", "Markdown"]) {
    const n = await page.locator(`text=${f}`).count();
    check(`菜单里有 ${f} 选项`, n > 0);
  }
  await page.screenshot({ path: path.join(OUT, "ui-export-menu.png") });

  // ---- 3. 直接走 IPC 导出三种格式（点菜单也行，但这里要拿到结果做断言）----
  for (const [format, ext, minSize] of [["pdf", ".pdf", 20000], ["docx", ".docx", 5000], ["markdown", ".导出.md", 100]]) {
    const r = await page.evaluate(async ([md, src, fmt]) => {
      return window.gezhi.exporter.run({
        format: fmt,
        markdown: md,
        sourcePath: src,
        defaultName: "情态动词",
      });
    }, [MD, target, format]);

    check(`★ 导出 ${format} 成功`, r.ok === true, r.ok ? `${((r.size ?? 0) / 1024).toFixed(1)} KB` : String(r.error));
    if (r.ok && r.path) {
      check(`  ${format} 文件真的存在`, fs.existsSync(r.path), path.basename(r.path));
      const size = fs.statSync(r.path).size;
      check(`  ${format} 体积合理（>${(minSize / 1024).toFixed(0)}KB）`, size > minSize, `${(size / 1024).toFixed(1)} KB`);
    }
  }

  // ---- 4. 产出物无产品署名（硬规矩）----
  for (const f of ["情态动词.pdf", "情态动词.docx"]) {
    const p = path.join(vault, f);
    if (!fs.existsSync(p)) { check(`${f} 无署名`, false, "文件不存在"); continue; }
    const raw = fs.readFileSync(p);
    const hitUtf8 = raw.includes(Buffer.from("格致", "utf8"));
    const hitUtf16 = raw.includes(Buffer.from("格致", "utf16le"));
    check(`★ ${f} 无产品署名`, !hitUtf8 && !hitUtf16);
  }

  // ---- 5. 内容正确性：PDF 里应该有中文与公式 ----
  const pdfPath = path.join(vault, "情态动词.pdf");
  if (fs.existsSync(pdfPath)) {
    const txt = fs.readFileSync(pdfPath).toString("latin1");
    check("PDF 嵌入了中文字体", /DengXian|YaHei|SimSun|MSYH/i.test(txt),
      (txt.match(/\/BaseFont\s*\/([A-Za-z0-9+,-]+)/g) ?? []).slice(0, 3).join(", "));
    check("PDF 不是空白（>30KB）", fs.statSync(pdfPath).size > 30000,
      `${(fs.statSync(pdfPath).size / 1024).toFixed(1)} KB`);
  }

  check("渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  // 把导出结果留一份到 产出/ 供肉眼检查
  for (const f of ["情态动词.pdf", "情态动词.docx"]) {
    const p = path.join(vault, f);
    if (fs.existsSync(p)) {
      try { fs.copyFileSync(p, path.join(OUT, "界面导出-" + f)); } catch { /* 忽略 */ }
    }
  }
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
console.log(`\n导出结果副本：产出/界面导出-情态动词.pdf / .docx`);
process.exit(passed === results.length ? 0 : 1);
