#!/usr/bin/env node
// 验证**打包后**的导出功能
//
// 为什么必须单独测：导出依赖两个外部资源
//   1. Typst 模板 templates/typst/handout.typ（靠 extraResources 进 resources/）
//   2. python-docx 脚本 templates/docx/md2docx.py
// 开发态它们在仓库里，打包后必须靠 extraResources。
// 漏了的话：打包版能打开导出菜单，一点导出就失败 —— 而开发态全绿。
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PACKED = path.join(ROOT, "dist", "installer", "win-unpacked");
const EXE = path.join(PACKED, "格致.exe");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, pass: Boolean(ok), detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "  " + detail : ""}`);
}

console.log("=== 打包版导出功能验证 ===\n");
if (!fs.existsSync(EXE)) {
  console.error("找不到打包产物：", EXE);
  process.exit(1);
}

// ---- 静态检查：随包资源是否齐全 ----
const res = path.join(PACKED, "resources");
for (const [rel, label] of [
  ["templates/typst/handout.typ", "Typst 讲义模板"],
  ["templates/typst/gezhi.typ", "Typst 字体栈"],
  ["typst/typst.exe", "★ 内置 Typst 可执行文件"],
  ["typst/LICENSE", "Typst 许可（Apache-2.0 副署要求）"],
  ["typst/NOTICE", "Typst NOTICE"],
]) {
  const p = path.join(res, rel);
  check(`resources 里有${label}`, fs.existsSync(p),
    fs.existsSync(p) ? `${(fs.statSync(p).size / 1024 / 1024).toFixed(1)} MB` : "缺失");
}

// docx 库（纯 JS 生成 Word）应打进 app.asar
const asarPath = path.join(res, "app.asar");
if (fs.existsSync(asarPath)) {
  const sizeMB = fs.statSync(asarPath).size / 1024 / 1024;
  check("app.asar 存在且含运行依赖", sizeMB > 30, `${sizeMB.toFixed(1)} MB`);
}

// ---- 动态检查：真的启动打包版导出一次 ----
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "gezhi-pexp-"));
fs.mkdirSync(path.join(vault, ".gezhi"), { recursive: true });
fs.writeFileSync(path.join(vault, ".gezhi", "vault.json"),
  JSON.stringify({ id: "pexp", name: "打包导出测试" }), "utf8");

const BS = String.fromCharCode(92);
const MD = [
  "---",
  "type: 讲义",
  "---",
  "",
  "# 打包版导出测试",
  "",
  "中文、**粗体**、`代码` 都要正常。",
  "",
  "| 项 | 值 |",
  "| --- | --- |",
  "| 甲 | 1 |",
  "| 乙 | 2 |",
  "",
  "$$" + BS + "frac{a}{b}$$",
  "",
  "行内 $E = mc^2$。",
  "",
  "相关：[[另一篇]]",
].join("\n");
const src = path.join(vault, "打包测试.md");
fs.writeFileSync(src, MD, "utf8");

console.log("\n  启动打包后的应用…");
// ★ 关键测试手法：**把系统 Typst 藏起来**
//   设 GEZHI_TYPST 指向一个不存在的路径，这样 findTypst 的环境变量分支失效，
//   系统 PATH / winget 也可能被绕过 —— 唯一能用的就是随包内置的那份。
//   如果导出仍然成功，就证明"全内置"是真的成立，而不是悄悄用了系统装的 Typst。
const app = await electron.launch({
  executablePath: EXE,
  args: [],
  env: {
    ...process.env,
    GEZHI_TEST: "1",
    GEZHI_TYPST: "C:\\__gezhi_should_not_exist__\\typst.exe",
    // 再把 PATH 里可能存在的 typst 拿掉（findTypst 会试 PATH）
    PATH: String(process.env.PATH ?? "").split(path.delimiter)
      .filter((p) => !/typst|cargo/i.test(p)).join(path.delimiter),
  },
});
const page = await app.firstWindow();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

try {
  await page.waitForSelector(".app", { timeout: 40000 });
  await page.waitForFunction(() => Boolean(window.__gezhiTest), { timeout: 20000 });

  const probe = await page.evaluate(() => window.gezhi.exporter.probe());
  check("★ 打包版探测到 Typst", probe.pdf.available === true,
    probe.pdf.available ? String(probe.pdf.engine) : String(probe.pdf.reason));
  check("★ 用的是**随包内置**的 typst（不是系统装的）",
    probe.pdf.bundled === true && String(probe.pdf.engine).includes("resources"),
    `${probe.pdf.bundled ? "bundled" : "系统"}：${probe.pdf.engine}`);
  check("★ 打包版模板路径指向 resources（不是仓库）",
    String(probe.paths.templatePath).includes("resources"),
    probe.paths.templatePath);
  check("★ Word 用内置纯 JS 转换器（不依赖 Python）",
    probe.docx.available === true && String(probe.docx.engine).includes("内置"),
    String(probe.docx.engine));

  for (const [fmt, ext, min] of [["pdf", ".pdf", 20000], ["docx", ".docx", 5000]]) {
    const r = await page.evaluate(async ([md, s, f]) => {
      return window.gezhi.exporter.run({ format: f, markdown: md, sourcePath: s, defaultName: "打包测试" });
    }, [MD, src, fmt]);
    check(`★ 打包版导出 ${fmt} 成功`, r.ok === true, r.ok ? `${((r.size ?? 0) / 1024).toFixed(1)} KB` : String(r.error));
    if (r.ok && r.path) {
      check(`  打包版 ${fmt} 文件存在且体积合理`, fs.existsSync(r.path) && fs.statSync(r.path).size > min,
        `${(fs.statSync(r.path).size / 1024).toFixed(1)} KB`);
      const raw = fs.readFileSync(r.path);
      check(`  ${fmt} 无产品署名`,
        !raw.includes(Buffer.from("格致", "utf8")) && !raw.includes(Buffer.from("格致", "utf16le")));
    }
  }

  check("打包版渲染进程无 JS 报错", errs.length === 0, errs.slice(0, 2).join(" | "));
} finally {
  const out = path.join(ROOT, "产出");
  fs.mkdirSync(out, { recursive: true });
  for (const f of ["打包测试.pdf", "打包测试.docx"]) {
    const p = path.join(vault, f);
    if (fs.existsSync(p)) { try { fs.copyFileSync(p, path.join(out, "打包版-" + f)); } catch { /* 忽略 */ } }
  }
  await app.close();
  try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* 忽略 */ }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n=== 结果：${passed}/${results.length} 通过 ===`);
for (const r of results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
process.exit(passed === results.length ? 0 : 1);
